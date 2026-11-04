import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

let db: PGlite;
const alice = "50000000-0000-4000-8000-000000000001";
const bob = "50000000-0000-4000-8000-000000000002";
const privateId = "60000000-0000-4000-8000-000000000001";
const publicId = "60000000-0000-4000-8000-000000000002";
const place = "20000000-0000-4000-8000-000000000001";
const otherPlace = "20000000-0000-4000-8000-000000000002";

async function asUser<T>(user: string | null, sql: string) {
  await db.exec(
    `begin; set local role ${user ? "authenticated" : "anon"}; select set_config('request.jwt.claim.sub', '${user || ""}', true);`,
  );
  try {
    return await db.query<T>(sql);
  } finally {
    await db.exec("rollback");
  }
}
async function writeAs(user: string, sql: string) {
  await db.exec(
    `begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${user}', true);`,
  );
  try {
    await db.exec(sql);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select array[split_part($1, '/', 1)] $$;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, delete on storage.objects to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611040001_somewhere.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
  );
  await db.exec(`insert into auth.users values ('${alice}'), ('${bob}');`);
  await writeAs(alice, `select public.somewhere_ensure_profile();`);
  await writeAs(bob, `select public.somewhere_ensure_profile();`);
  await writeAs(
    alice,
    `
    insert into public.somewhere_collections(id,owner_id,name,visibility) values
      ('${privateId}','${alice}','Private birthday','private'),('${publicId}','${alice}','Public birthday','public');
    select public.somewhere_save_place('${place}',array['${privateId}'::uuid,'${publicId}'::uuid],true);
    select public.somewhere_save_place('${otherPlace}',array['${privateId}'::uuid],false);
    insert into storage.objects(bucket_id,name) values ('somewhere-images','${alice}/private.jpg');
    update public.somewhere_collections set cover='upload:${alice}/private.jpg' where id='${privateId}';
  `,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("PostgreSQL schema and access policies", () => {
  it("lets visitors browse public guides without disclosing private collections or their items", async () => {
    const anon = await asUser<{ id: string }>(
      null,
      "select id from public.somewhere_collections",
    );
    expect(anon.rows.some((r) => r.id === privateId)).toBe(false);
    expect(anon.rows.some((r) => r.id === publicId)).toBe(true);
    const items = await asUser<{ collection_id: string }>(
      bob,
      "select collection_id from public.somewhere_collection_places",
    );
    expect(items.rows.some((r) => r.collection_id === privateId)).toBe(false);
    const owner = await asUser<{ id: string }>(
      alice,
      `select id from public.somewhere_collections where id='${privateId}'`,
    );
    expect(owner.rows).toHaveLength(1);
  });
  it("keeps favourites private and prevents changing other people’s collections", async () => {
    expect(
      (await asUser(bob, "select * from public.somewhere_saved_places")).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(alice, "select * from public.somewhere_saved_places")).rows,
    ).toHaveLength(1);
    const deleted = await asUser(
      bob,
      `delete from public.somewhere_collections where id='${privateId}' returning id`,
    );
    expect(deleted.rows).toHaveLength(0);
    await expect(
      writeAs(
        bob,
        `insert into public.somewhere_collections(owner_id,name) values('${alice}','Stolen')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("rejects unauthorized atomic saves without partial changes", async () => {
    await expect(
      writeAs(
        bob,
        `select public.somewhere_save_place('${place}',array['${privateId}'::uuid],true);`,
      ),
    ).rejects.toThrow(/own collections/);
    expect(
      (await asUser(bob, "select * from public.somewhere_saved_places")).rows,
    ).toHaveLength(0);
    await expect(
      asUser(
        null,
        `select public.somewhere_save_place('${place}',array[]::uuid[],true)`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("persists exact custom ordering and refuses stale payloads", async () => {
    await writeAs(
      alice,
      `select public.somewhere_reorder_collection('${privateId}',array['${otherPlace}'::uuid,'${place}'::uuid])`,
    );
    const order = await asUser<{ place_id: string }>(
      alice,
      `select place_id from public.somewhere_collection_places where collection_id='${privateId}' order by position`,
    );
    expect(order.rows.map((r) => r.place_id)).toEqual([otherPlace, place]);
    await expect(
      writeAs(
        alice,
        `select public.somewhere_reorder_collection('${privateId}',array['${place}'::uuid,'${place}'::uuid])`,
      ),
    ).rejects.toThrow(/order/);
  });
  it("protects private images, including guessed references through another profile or public collection", async () => {
    expect(
      (await asUser(bob, "select * from storage.objects")).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(alice, "select * from storage.objects")).rows,
    ).toHaveLength(1);
    await expect(
      writeAs(
        bob,
        `update public.somewhere_profiles set avatar='upload:${alice}/private.jpg' where id='${bob}'`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      writeAs(
        bob,
        `insert into public.somewhere_collections(owner_id,name,cover,visibility) values('${bob}','Guessed cover','upload:${alice}/private.jpg','public')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      writeAs(
        bob,
        `insert into storage.objects(bucket_id,name) values('somewhere-images','${alice}/foreign.jpg')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("does not let clients invent editorial profiles, edit the catalogue or change identity columns", async () => {
    await expect(
      writeAs(
        bob,
        `update public.somewhere_profiles set editorial=true,user_id=null where id='${bob}'`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      writeAs(bob, `delete from public.somewhere_places where id='${place}'`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      writeAs(
        bob,
        `insert into public.somewhere_profiles(id,username,name,editorial) values(gen_random_uuid(),'fake.editor','Fake',true)`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("allows real follows and public likes but not likes on inaccessible private guides", async () => {
    await writeAs(
      bob,
      `insert into public.somewhere_follows values('${bob}','${alice}'); insert into public.somewhere_likes values('${bob}','${publicId}');`,
    );
    expect(
      (
        await asUser(
          null,
          `select * from public.somewhere_follows where follower_id='${bob}'`,
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      writeAs(
        bob,
        `insert into public.somewhere_likes values('${bob}','${privateId}')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
