# Decisiones de arquitectura (ADR)

Cada archivo registra una decisión que da forma al sistema: el contexto en que se tomó, qué se decidió, qué otras opciones había y qué consecuencias trae, buenas y malas. Una decisión no se edita para cambiarla: si deja de valer, se escribe un ADR nuevo que la reemplaza y se marca la anterior como reemplazada.

| ADR | Decisión | Estado |
|---|---|---|
| [001](001-stack-vercel-supabase.md) | Vercel y Supabase como plataforma, con Node.js, Express y EJS | Vigente |
| [002](002-una-instancia-por-cliente.md) | Una instancia por cliente con el mismo código | Vigente |
| [003](003-anulacion-por-contrapartida.md) | Una factura se anula con una contrapartida contable, nunca se borra | Vigente |

Las decisiones de planificación de las semanas 4 y 5 (D-01 a D-11) están en [`docs/plan.md`](../plan.md) y en las bitácoras. D-07 es el origen del ADR 002.

## Formato

```markdown
# ADR NNN: título en una frase

- **Estado:** propuesta | aceptada | reemplazada por ADR NNN
- **Fecha de la decisión:**
- **Relacionada con:**

## Contexto
## Decisión
## Alternativas consideradas
## Consecuencias
```
