# visor_opsur

## Supabase (tablas públicas)
Ejecuta el siguiente script en el editor SQL de Supabase para crear las tablas utilizadas por la aplicación con todo el acceso expuesto al rol `anon` (sin políticas de RLS). Puedes adaptarlo si luego deseas endurecer los permisos.

```sql
-- Habilita PostGIS una sola vez por proyecto
create extension if not exists postgis;

-- Tabla de puntos importados desde recorridos
create table if not exists public.fotos_recorrido (
  id bigserial primary key,
  geom geometry(Point, 4326) not null,
  este double precision,
  norte double precision,
  grupo text not null,
  codigo text not null,
  progresiva text,
  numero integer,
  descripcion text,
  foto_url text,
  foto_r2_key text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists fotos_recorrido_grupo_idx on public.fotos_recorrido (grupo);
create index if not exists fotos_recorrido_codigo_idx on public.fotos_recorrido (lower(codigo));

-- Tabla de marcaciones creadas desde la UI
create table if not exists public.marcaciones (
  id bigserial primary key,
  nombre text not null,
  descripcion text,
  lat double precision not null,
  lng double precision not null,
  geom geometry(Point, 4326) not null,
  tipo text,
  foto_url text,
  foto_r2_key text,
  created_at timestamptz default now()
);

create index if not exists marcaciones_geom_idx on public.marcaciones using gist (geom);

-- Adjuntos adicionales por marcación
create table if not exists public.marcaciones_adjuntos (
  id bigserial primary key,
  marcacion_id bigint not null references public.marcaciones(id) on delete cascade,
  nombre text not null,
  url text not null,
  r2_key text,
  content_type text,
  size bigint,
  created_at timestamptz default now()
);

create index if not exists marcaciones_adjuntos_marcacion_id_idx on public.marcaciones_adjuntos (marcacion_id);

-- Permisos "públicos": deja usar las tablas al rol anon sin RLS
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
```

> **Importante:** Cuando quieras securizar los datos, activa RLS (`alter table ... enable row level security`) y define políticas específicas.

### Adjuntos y `created_by`

Para evitar el error `null value in column "created_by"` cuando la tabla `marcaciones_adjuntos` exige un valor, la aplicación asigna por defecto el identificador `00000000-0000-0000-0000-000000000000`. Si prefieres usar otro valor (por ejemplo, un UUID de servicio propio), declara la variable global antes de cargar `app.js`:

```html
<script>
  window.SUPABASE_DEFAULT_CREATED_BY = 'mi-uuid-de-servicio';
</script>
<script src="app.js" type="module"></script>
```

Si deseas que cada usuario quede registrado con su `auth.uid()`, establece `window.SUPABASE_DEFAULT_CREATED_BY = null` para que la app intente abrir una sesión anónima usando **Supabase → Auth → Providers → Enable anonymous sign-ins**. Cuando esa opción está deshabilitada, la aplicación continuará funcionando con el valor fijo configurado.
