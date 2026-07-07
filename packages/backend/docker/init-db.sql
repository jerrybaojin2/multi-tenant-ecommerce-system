-- 首次启动 PG 容器时由 docker-entrypoint-initdb.d 自动执行。
-- cool_dev 由 POSTGRES_DB 创建；这里额外创建测试库 cool_test，
-- 供 packages/backend 的真实多租户隔离测试（tests/real-tenant.test.mjs）使用。
CREATE DATABASE cool_test;
