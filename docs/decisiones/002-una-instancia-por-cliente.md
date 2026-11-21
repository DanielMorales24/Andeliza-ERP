# ADR 002: una instancia por cliente con el mismo código

- **Estado:** aceptada y vigente
- **Fecha de la decisión:** semana 1 como intención; formalizada en la semana 5 como decisión D-07 al poner en producción a JCL Sport. Se registra como ADR en la semana 6.
- **Relacionada con:** [ADR 001](001-stack-vercel-supabase.md), decisiones D-07 y D-08 en [`docs/plan.md`](../plan.md), [`db/README.md`](../../db/README.md)

## Contexto

Andeliza tiene hoy dos clientes en producción con necesidades distintas: JCL Sport trabaja con comprobante interno y sin SAR; Las Flores factura con CAI. Cada uno tiene su catálogo, su paleta, su logo, sus usuarios y, sobre todo, su contabilidad. Un error que mostrara las ventas o el libro diario de un negocio a otro sería grave y destruiría la confianza en el sistema.

Hasta la semana 4 la personalización por cliente se planteaba como un repositorio clonado con sus valores escritos en `client.config.js`. Al preparar el primer despliegue real (semana 5) hubo que decidir cómo convive más de un negocio con un solo desarrollador que mantiene el código.

## Decisión

Cada negocio tiene **su propio proyecto de Vercel y su propia base de Supabase**, y todos ejecutan **el mismo código del mismo repositorio**. Hoy hay tres instancias: desarrollo (`andeliza-dev`), JCL Sport y Las Flores.

Lo que distingue a una instancia vive en tres lugares, ninguno en el código:

1. Las **variables de entorno** de su proyecto de Vercel (`DATABASE_URL`, `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`).
2. La fila de **`configuracion_negocio`** de su base: nombre, logo, paleta, formato regional y lo que eligió del catálogo maestro (unidades, variantes, categorías y, desde la semana 6, métodos de pago).
3. El **seed** con el que se instaló (`seed-produccion.sql` o su copia para cada cliente).

`client.config.js` deja de describir a un cliente y pasa a ser el **catálogo maestro** compartido: dice qué opciones existen; cada base guarda cuáles usa (decisión D-08).

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| **Multi-tenant en una sola base** (columna `negocio_id` en cada tabla, filtros en cada consulta y RLS de Supabase) | Habría que agregar el negocio a 26 tablas y a todas las funciones que protegen el stock, la numeración fiscal y la partida doble, que es justo donde un error es más caro. Una consulta con un filtro olvidado expone datos de otro cliente. |
| **Un repositorio clonado por cliente**, con sus valores en `client.config.js` | Cada clon diverge: una corrección hay que copiarla a mano en cada repositorio y tarde o temprano alguno queda atrás. |
| **Una instancia por cliente con el mismo código** | **Elegida.** |

## Consecuencias

**Positivas**

- **Aislamiento por construcción.** Los datos de un negocio están en otra base: ningún error de consulta puede mostrarlos a otro cliente.
- Copia de seguridad, restauración y baja de un cliente se hacen por base, sin tocar a los demás.
- Un arreglo llega a todos con el mismo `git push`.
- Cada cliente puede tener su dominio y sus límites de uso por separado.

**Negativas y cómo se manejan**

- **Cada migración se ejecuta en cada base.** La 09 de la semana 6 se corre tres veces: desarrollo, JCL Sport y Las Flores. Para que no haya prisa ni ventanas de error, las migraciones son aditivas y se ejecutan **antes** del `git push`: el código anterior sigue funcionando con ellas (se probó con la 09).
- **Las bases pueden quedar desfasadas** si se olvida una. Por eso cada migración se puede repetir sin efecto y `db/README.md` trae su verificación. Con más clientes haría falta un script que aplique y compruebe las migraciones en todas las bases.
- **Costo por cliente:** un proyecto de Supabase y uno de Vercel. Los planes gratuitos alcanzan para los primeros clientes; está en la estructura de costos.
- **Nada propio de un negocio puede quedar en el código.** Es una disciplina: cualquier dato de un cliente va a su base o a su seed.

## Cuándo revisarla

Si Andeliza pasara de unas diez instancias, el costo de mantener las migraciones a mano empezaría a pesar más que el aislamiento. En ese punto conviene automatizar el despliegue de migraciones y volver a evaluar la alternativa multi-tenant con RLS.
