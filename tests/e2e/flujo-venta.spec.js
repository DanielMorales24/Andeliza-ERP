// Foco: FLUJO CENTRAL. Lo que hace la dueña todos los días, de punta a punta en un navegador real:
// entrar → punto de venta → agregar un producto → cobrar en efectivo → ver el comprobante, y
// comprobar en la base que el stock bajó y que el dinero entró a Caja.
// Los selectores son por rol y por texto (lo que ve la persona), no por clases CSS.
const { test, expect } = require('@playwright/test');
const B = require('../soporte/base');

const PRODUCTO = 'Producto para la prueba de punta a punta';   // tests/fixtures/datos-prueba.sql, SKU E2E-001

test.afterAll(async () => { await B.cerrar(); });

test('el administrador cobra una venta en efectivo, ve el comprobante y el stock se descuenta', async ({ page }) => {
  // Preparar
  const stockAntes = await B.stockProducto('E2E-001');
  const ventasAntes = Number(await B.valor('SELECT COUNT(*) FROM ventas'));

  // Actuar: iniciar sesión
  await page.goto('/login');
  await page.getByLabel('Usuario').fill('admin');
  await page.getByLabel('Contraseña', { exact: true }).fill('Pruebas.2026');
  await page.getByRole('button', { name: 'Acceder' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  // Ir al punto de venta desde el menú
  await page.getByRole('link', { name: 'Punto de venta' }).first().click();
  await expect(page).toHaveURL(/\/pos$/);

  // Agregar el producto y cobrar con Efectivo
  await page.getByRole('button', { name: new RegExp(`^Agregar ${PRODUCTO}`) }).click();
  const efectivo = page.getByRole('radio', { name: 'Efectivo' });
  await efectivo.click();
  await expect(efectivo).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /^Cobrar L/ }).click();

  // Comprobar: el comprobante en pantalla
  const comprobante = page.getByRole('status').filter({ hasText: 'Venta registrada' });
  await expect(comprobante).toBeVisible();
  await expect(comprobante.getByText('Comprobante interno')).toBeVisible();
  await expect(comprobante.getByText(/^No\. INT-\d+$/)).toBeVisible();
  await expect(comprobante.getByText('Pagó con Efectivo')).toBeVisible();
  await expect(comprobante.getByRole('link', { name: 'Imprimir PDF' })).toBeVisible();

  // Comprobar: en la base, una venta más, el stock bajó en 1 y el dinero entró a Caja
  await expect.poll(() => B.stockProducto('E2E-001')).toBe(stockAntes - 1);
  expect(Number(await B.valor('SELECT COUNT(*) FROM ventas'))).toBe(ventasAntes + 1);
  const venta = (await B.consulta('SELECT id, total::numeric AS total, metodo_pago FROM ventas ORDER BY id DESC LIMIT 1'))[0];
  expect(venta.metodo_pago).toBe('efectivo');
  const caja = await B.lineasDePartida("p.origen_tipo = 'venta' AND p.origen_id = $1 AND c.clave = 'caja'", [venta.id]);
  expect(caja).toEqual([{ clave: 'caja', debe: Number(venta.total), haber: 0 }]);
});
