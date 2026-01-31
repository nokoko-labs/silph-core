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
- `REDIS_HOST`: Host de Redis (default: `localhost`)
- `REDIS_PORT`: Puerto de Redis (default: `6379`)
- `REDIS_PASSWORD`: Contraseña de Redis (opcional, requerida si Redis tiene autenticación)

4. Inicia los servicios con Docker Compose:
```bash
docker-compose up -d
```

Esto iniciará PostgreSQL y Redis con persistencia de datos configurada.

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

El cliente de Prisma se genera automáticamente en `postinstall`. Para validar el schema: `pnpm run prisma:validate`.

```bash
# Generar cliente de Prisma
pnpm run prisma:generate

# Validar schema de Prisma
pnpm run prisma:validate

# Crear nueva migración
pnpm run prisma:migrate

# Aplicar migraciones en producción
pnpm run prisma:migrate:deploy

# Abrir Prisma Studio (GUI para la base de datos)
pnpm run prisma:studio

# Ejecutar seed (si está configurado)
# En producción, define ADMIN_SEED_PASSWORD antes de ejecutar el seed.
pnpm run prisma:seed
```

### Docker Compose

El proyecto incluye configuración de Docker Compose para PostgreSQL y Redis con persistencia de datos mediante volúmenes.

#### Servicios disponibles

- **PostgreSQL**: Base de datos principal en el puerto `5432`
- **Redis**: Cache y almacenamiento en memoria en el puerto `6379`

#### Comandos

```bash
# Iniciar todos los servicios (PostgreSQL y Redis)
docker-compose up -d

# Iniciar un servicio específico
docker-compose up -d postgres
docker-compose up -d redis

# Detener todos los servicios
docker-compose down

# Detener y eliminar volúmenes (⚠️ elimina todos los datos)
docker-compose down -v

# Ver logs de todos los servicios
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f postgres
docker-compose logs -f redis

# Ver el estado de los servicios
docker-compose ps

# Reiniciar un servicio
docker-compose restart postgres
docker-compose restart redis
```

#### Persistencia de datos

Los datos se persisten automáticamente mediante volúmenes de Docker:

- **PostgreSQL**: Los datos se guardan en el volumen `postgres_data`
- **Redis**: Los datos se guardan en el volumen `redis_data` (con AOF habilitado)

Los volúmenes persisten incluso si detienes los contenedores. Para eliminar los datos, usa `docker-compose down -v`.

#### Variables de entorno para Docker

Puedes configurar los servicios mediante variables de entorno en tu archivo `.env`:

```env
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=kime_db
POSTGRES_PORT=5432

# Redis
REDIS_PORT=6379
REDIS_PASSWORD=redis
```

#### Health checks

Ambos servicios incluyen health checks configurados:
- PostgreSQL: Verifica que el servicio esté listo para aceptar conexiones
- Redis: Verifica la conectividad mediante un comando ping

## 🔒 Git Hooks (Lefthook)

Este proyecto utiliza [Lefthook](https://github.com/evilmartians/lefthook) para ejecutar validaciones automáticas antes de commits y pushes.

### Commit-msg

Antes de aceptar el commit, se valida que el mensaje siga el formato de [Conventional Commits](https://www.conventionalcommits.org/):

**Formato requerido:** `type(scope): description`

**Reglas:**
- El header debe tener menos de 80 caracteres
- Type y scope deben estar en minúsculas
- Tipos válidos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`
- Scope es opcional pero recomendado
- Descripción debe estar en modo imperativo

**Ejemplos válidos:**
- ✅ `feat(auth): implement login with google`
- ✅ `fix(user): resolve crash on invalid email`
- ✅ `chore(deps): upgrade nestjs packages`
- ✅ `docs(readme): update installation steps`

**Ejemplos inválidos:**
- ❌ `feat: Added new feature` (sin scope, no imperativo)
- ❌ `FEAT(auth): implement login` (type en mayúsculas)
- ❌ `feat(auth): implemented login` (no imperativo)

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
│   ├── cache/                 # Módulo de Redis/Cache
│   │   ├── redis.module.ts
│   │   └── redis.service.ts
│   ├── config/                 # Configuración de la aplicación
│   │   ├── config.module.ts
│   │   └── env.schema.ts
│   ├── database/              # Módulo de base de datos
│   │   ├── database.module.ts
│   │   └── prisma.service.ts
│   ├── modules/               # Módulos de la aplicación (crear según necesidad)
│   ├── common/                # Utilidades compartidas
│   ├── app.module.ts
│   ├── app.service.ts
│   └── main.ts
├── scripts/                   # Scripts de utilidad
│   └── validate-commit-msg.sh  # Validación de commits
├── test/                      # Tests e2e
├── .env.example               # Template de variables de entorno
├── .lefthook.yml              # Configuración de Git hooks
├── biome.json                 # Configuración de Biome
├── docker-compose.yml         # Configuración de Docker (PostgreSQL + Redis)
└── package.json
```

## 🔴 Redis / Cache

El proyecto incluye integración con Redis para caching y almacenamiento en memoria.

### Uso del RedisService

El `RedisService` está disponible globalmente y puede ser inyectado en cualquier servicio:

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '@/cache/redis.service';

@Injectable()
export class UserService {
  constructor(private readonly redis: RedisService) {}

  async getUserFromCache(userId: string) {
    const cached = await this.redis.get(`user:${userId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }

  async setUserInCache(userId: string, userData: unknown, ttl = 3600) {
    await this.redis.set(
      `user:${userId}`,
      JSON.stringify(userData),
      ttl
    );
  }
}
```

### Métodos disponibles

El `RedisService` proporciona los siguientes métodos:

- `get(key: string)`: Obtener un valor
- `set(key: string, value: string, ttlSeconds?: number)`: Establecer un valor
- `del(key: string)`: Eliminar una clave
- `exists(key: string)`: Verificar si una clave existe
- `expire(key: string, seconds: number)`: Establecer tiempo de expiración
- `ttl(key: string)`: Obtener tiempo restante de vida
- `incr(key: string)`: Incrementar un valor
- `decr(key: string)`: Decrementar un valor
- `mget(...keys: string[])`: Obtener múltiples valores
- `mset(...keyValues: string[])`: Establecer múltiples valores
- `keys(pattern: string)`: Buscar claves por patrón
- `getClient()`: Obtener el cliente Redis para operaciones avanzadas

### Configuración

Redis se configura automáticamente usando las variables de entorno:
- `REDIS_HOST`: Host de Redis (default: `localhost`)
- `REDIS_PORT`: Puerto de Redis (default: `6379`)
- `REDIS_PASSWORD`: Contraseña de Redis (opcional)

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
