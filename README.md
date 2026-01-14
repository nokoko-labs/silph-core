# Kime API

Backend API desarrollada con NestJS, TypeScript y PostgreSQL. Este proyecto utiliza Prisma como ORM, Biome para linting y formateo, y está configurado para trabajar con PostgreSQL local (Docker) o Supabase.

## 🚀 Tech Stack

- **Framework:** NestJS 11
- **Lenguaje:** TypeScript (Strict mode)
- **Base de Datos:** PostgreSQL
- **ORM:** Prisma
- **Linter/Formatter:** Biome
- **Package Manager:** pnpm
- **Validación:** Zod
- **Git Hooks:** Lefthook

## 📋 Prerrequisitos

- Node.js (v18 o superior)
- pnpm (v9 o superior)
- Docker y Docker Compose (para base de datos local)
- PostgreSQL (si no usas Docker)

## 🛠️ Instalación

1. Clona el repositorio:
```bash
git clone <repository-url>
cd kime-api
```

2. Instala las dependencias:
```bash
pnpm install
```

3. Configura las variables de entorno:
```bash
cp .env.example .env
```

Edita el archivo `.env` y configura:
- `DATABASE_URL`: URL de conexión a PostgreSQL
  - Para local (Docker): `postgresql://postgres:postgres@localhost:5432/kime_db?schema=public`
  - Para Supabase: Tu connection string de Supabase

4. Inicia PostgreSQL local (opcional, si usas Docker):
```bash
docker-compose up -d
```

5. Genera el cliente de Prisma:
```bash
pnpm run prisma:generate
```

6. Ejecuta las migraciones:
```bash
pnpm run prisma:migrate
```

## 🏃 Desarrollo

### Iniciar el servidor en modo desarrollo

```bash
pnpm run start:dev
```

El servidor estará disponible en `http://localhost:3000` (o el puerto configurado en `PORT`).

### Otros comandos de desarrollo

```bash
# Modo producción
pnpm run start:prod

# Modo debug
pnpm run start:debug

# Compilar el proyecto
pnpm run build
```

## 🧪 Testing

```bash
# Ejecutar tests unitarios
pnpm run test

# Ejecutar tests en modo watch
pnpm run test:watch

# Ejecutar tests con cobertura
pnpm run test:cov

# Ejecutar tests e2e
pnpm run test:e2e
```

## 🔍 Linting y Formateo

### Verificar formato y linting

```bash
# Verificar formato
pnpm run format:check

# Verificar linting
pnpm run lint

# Verificar ambos (formato + linting)
pnpm run check
```

### Corregir automáticamente

```bash
# Formatear código
pnpm run format

# Corregir problemas de linting
pnpm run lint:fix

# Formatear y corregir linting
pnpm run check:fix
```

## 🗄️ Base de Datos

### Prisma

```bash
# Generar cliente de Prisma
pnpm run prisma:generate

# Crear nueva migración
pnpm run prisma:migrate

# Aplicar migraciones en producción
pnpm run prisma:migrate:deploy

# Abrir Prisma Studio (GUI para la base de datos)
pnpm run prisma:studio

# Ejecutar seed (si está configurado)
pnpm run prisma:seed
```

### Docker Compose

```bash
# Iniciar PostgreSQL
docker-compose up -d

# Detener PostgreSQL
docker-compose down

# Ver logs de PostgreSQL
docker-compose logs -f postgres

# Eliminar volúmenes (⚠️ elimina todos los datos)
docker-compose down -v
```

## 🔒 Git Hooks (Lefthook)

Este proyecto utiliza [Lefthook](https://github.com/evilmartians/lefthook) para ejecutar validaciones automáticas antes de commits y pushes.

### Pre-commit

Antes de cada commit, se ejecuta automáticamente:
- Formateo de código (Biome)
- Corrección de problemas de linting
- Verificación general de código

Los archivos modificados se formatean automáticamente y se agregan al commit.

### Pre-push

Antes de cada push, se ejecuta:
- Verificación de tipos TypeScript
- Ejecución de tests unitarios
- Validación del schema de Prisma

### Instalación de hooks

Los hooks se instalan automáticamente al ejecutar `pnpm install` gracias al script `prepare`.

Si necesitas reinstalarlos manualmente:

```bash
pnpm exec lefthook install
```

### Saltar hooks (solo en casos excepcionales)

```bash
# Saltar pre-commit
git commit --no-verify

# Saltar pre-push
git push --no-verify
```

⚠️ **Nota:** Solo salta los hooks en casos excepcionales. El código debe cumplir con los estándares del proyecto.

## 📁 Estructura del Proyecto

```
kime-api/
├── prisma/
│   └── schema.prisma          # Schema de Prisma
├── src/
│   ├── config/                 # Configuración de la aplicación
│   │   ├── config.module.ts
│   │   └── config.validation.ts
│   ├── database/              # Módulo de base de datos
│   │   ├── database.module.ts
│   │   └── prisma.service.ts
│   ├── modules/               # Módulos de la aplicación (crear según necesidad)
│   ├── common/                # Utilidades compartidas
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   └── main.ts
├── test/                      # Tests e2e
├── .env.example               # Template de variables de entorno
├── .lefthook.yml              # Configuración de Git hooks
├── biome.json                 # Configuración de Biome
├── docker-compose.yml         # Configuración de Docker para PostgreSQL
└── package.json
```

## 🔧 Configuración

### Variables de Entorno

Las variables de entorno se validan automáticamente al iniciar la aplicación usando Zod. Las variables requeridas son:

- `NODE_ENV`: Entorno de ejecución (`development`, `production`, `test`)
- `PORT`: Puerto del servidor (default: 3000)
- `DATABASE_URL`: URL de conexión a PostgreSQL

Ver `.env.example` para más detalles.

### Biome

La configuración de Biome se encuentra en `biome.json`. El proyecto está configurado con:
- Formateo automático
- Linting estricto
- Organización automática de imports
- Reglas específicas para TypeScript

## 📝 Convenciones de Commit

Este proyecto sigue el formato de commits convencionales:

```
type(scope): description
```

**Tipos:**
- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `docs`: Documentación
- `style`: Formato (sin cambios de código)
- `refactor`: Refactorización
- `perf`: Mejora de rendimiento
- `test`: Tests
- `chore`: Tareas de mantenimiento
- `ci`: CI/CD

**Ejemplos:**
- `feat(auth): implement login endpoint`
- `fix(user): resolve email validation issue`
- `chore(deps): update nestjs packages`

## 🚢 Despliegue

1. Asegúrate de que todas las variables de entorno estén configuradas
2. Ejecuta las migraciones de Prisma:
```bash
pnpm run prisma:migrate:deploy
```
3. Compila el proyecto:
```bash
pnpm run build
```
4. Inicia la aplicación:
```bash
pnpm run start:prod
```

## 📚 Recursos

- [Documentación de NestJS](https://docs.nestjs.com)
- [Documentación de Prisma](https://www.prisma.io/docs)
- [Documentación de Biome](https://biomejs.dev)
- [Documentación de Lefthook](https://github.com/evilmartians/lefthook)

## 📄 Licencia

UNLICENSED
