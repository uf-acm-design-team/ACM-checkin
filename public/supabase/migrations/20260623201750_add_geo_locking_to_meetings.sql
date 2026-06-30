create schema if not exists "postgis";

alter table "public"."meetings" add column "is_geo_locked" boolean not null default false;

alter table "public"."meetings" add column "latitude" double precision;

alter table "public"."meetings" add column "longitude" double precision;

alter table "public"."meetings" add column "radius_meters" integer default 200;


