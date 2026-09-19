# Sitio Tita Media

Sitio de marketing de Tita Media, exportado desde un proyecto de Claude Design ("Sitio Tita Media") e implementado como sitio estático: sin build, sin bundler, sin `package.json`.

## Páginas

| Página | Archivo |
|---|---|
| Inicio | `index.html` |
| Strategy & Advisory | `strategy-advisory.html` |
| AI & Custom Solutions | `ai-custom-solutions.html` |
| Commerce Solutions | `commerce-solutions.html` |
| Retail Growth | `retail-growth.html` |
| Cloud & Data | `cloud-data.html` |

Componentes compartidos (usados por las 5 páginas de soluciones vía `dc-import`): `SiteHeader.dc.html`, `SiteFooter.dc.html`, `ContactForm.dc.html`.

## Correr en local

```bash
./dev.sh              # sirve el sitio en http://localhost:5173
PORT=8080 ./dev.sh     # puerto personalizado
```

`dev.sh` usa `python3 -m http.server` — no requiere instalar nada. Las páginas deben servirse por HTTP (no abrir con `file://`): el runtime hace `fetch()` e `import()` dinámicos que fallan bajo `file://`.

## Estructura del repo

```
/                     las 6 páginas + los 3 componentes compartidos (deben estar en la raíz, no en subcarpetas)
/support.js           runtime del sitio (generado, no editar a mano)
/js/                  módulos JS: navegación (site-motion.js), FAQ (faq-accordion.js) y gráficos animados por sección
/images/              logo de Tita Media y logos de plataformas (VTEX, Shopify, commercetools, Salesforce, WooCommerce)
robots.txt, sitemap.xml   en la raíz
```

Por qué la raíz no se puede reorganizar en más subcarpetas, y por qué `support.js` no puede moverse a `/js/`, está explicado en detalle en [`CLAUDE.md`](./CLAUDE.md) — son restricciones reales del runtime, no solo convención.

## SEO

Cada página trae `<title>`, meta description, canonical, Open Graph, Twitter Card y JSON-LD (`Organization`/`WebSite` en Inicio, `BreadcrumbList` en las demás). `robots.txt` y `sitemap.xml` asumen el dominio de producción `https://titamedia.com` — actualizar ambos si el dominio cambia.

## Documentación adicional

- [`CLAUDE.md`](./CLAUDE.md) — arquitectura técnica del sitio: cómo funciona el runtime, por qué la estructura de carpetas es la que es, cómo agregar una página nueva.
- [`PRODUCT.md`](./PRODUCT.md) / [`DESIGN.md`](./DESIGN.md) — contexto de producto y sistema de diseño (capturados con la skill `/impeccable`).

## Estado

Despliegue en producción: pendiente de configurar.
