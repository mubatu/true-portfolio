import os

# Importing app modules builds settings and a (lazy) DB engine; tests never
# connect, so placeholder values are enough when no .env is present.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ.setdefault("SUPABASE_URL", "http://localhost")
