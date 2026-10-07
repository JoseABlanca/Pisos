# Nexo Accounting & Finance (React + Vite)

Plataforma integral de gestión contable, financiera, inmobiliaria, laboral y de inversiones patrimoniales.

---

## Información Técnica del Entorno (Vite + React)

Esta plantilla proporciona una configuración optimizada para ejecutar React en Vite con Recarga Rápida de Módulos (HMR) y reglas de análisis de código con ESLint.

Actualmente existen dos plugins oficiales disponibles:
- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react): utiliza [Oxc](https://oxc.rs).
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc): utiliza [SWC](https://swc.rs/).

### Compilador de React (React Compiler)
El compilador experimental de React no está habilitado en esta plantilla debido a su impacto en el rendimiento de desarrollo y compilación. Para añadirlo, consulta [la documentación oficial](https://react.dev/learn/react-compiler/installation).

### Ampliación de la configuración de ESLint
Si desarrollas una aplicación de producción, se recomienda usar TypeScript con reglas de tipado estricto habilitadas. Consulta la [plantilla oficial de TypeScript](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) para más información sobre cómo integrar TypeScript y [`typescript-eslint`](https://typescript-eslint.io) en el proyecto.

---

## Comandos del Proyecto

En la carpeta `antigravity-finance`:

* `npm run dev`: Inicia el servidor de desarrollo local de Vite con recarga en vivo.
* `npm run build`: Compila y optimiza la aplicación para producción en la carpeta `dist/`.
* `npm run preview`: Previsualiza localmente la versión de producción compilada.
* `npm run lint`: Ejecuta el análisis de calidad de código con ESLint.

En la raíz (`pisos/`):
* `Iniciar_Nexo.bat`: Acceso directo para arrancar el servidor y abrir automáticamente el navegador.

---

## Estructura del Proyecto y Explicación de Archivos

### 1. Nivel Raíz (`pisos/`)

* **`Iniciar_Nexo.bat`**: Script de ejecución rápida para Windows. Navega a `antigravity-finance`, arranca el servidor local y abre la aplicación en el navegador sin necesidad de usar la terminal.
* **`antigravity-finance/`**: Carpeta principal que aloja la aplicación completa (Frontend y Backend serverless).

---

### 2. Configuración y Entorno (`antigravity-finance/`)

#### Carpetas del Sistema
* **`node_modules/`**: Paquetes y dependencias externas instaladas por npm (React, Vite, Recharts, Lucide, Firebase, Tailwind, etc.). No se modifica manualmente.
* **`dist/`**: Carpeta de distribución generada al ejecutar `npm run build` con todos los archivos HTML, CSS y JS listos para producción.
* **`public/`**: Recursos estáticos públicos accesibles directamente por URL (`favicon.svg`, logos e iconos).
* **`.firebase/`**: Caché interna del CLI de Firebase para agilizar despliegues.
* **`functions/`**: Backend serverless (Cloud Functions de Firebase):
  * **`index.js`**: Funciones en Node.js que se ejecutan en los servidores de Google (tareas programadas, sincronizaciones o endpoints seguros).
  * **`package.json`** y **`package-lock.json`**: Dependencias específicas del entorno de Cloud Functions.

#### Archivos de Configuración en la Raíz
* **`package.json`**: Manifiesto del proyecto. Define los comandos de ejecución (`dev`, `build`, etc.) y las dependencias del frontend.
* **`package-lock.json`**: Registro inmutable de versiones de cada librería instalada para garantizar reproducibilidad exacta.
* **`vite.config.js`**: Configuración del empaquetador Vite, plugins de React y motor de estilos Tailwind CSS.
* **`index.html`**: Página web base donde se monta la aplicación React (`#root`).
* **`.gitignore`**: Lista de archivos y carpetas excluidos del control de versiones (archivos temporales, dependencias y logs).
* **`.firebaserc`**: Vincula este entorno local con el ID del proyecto en la nube de Google Firebase.
* **`firebase.json`**: Configuración de Firebase Hosting (rutas de la aplicación SPA) y Cloud Functions.
* **`firestore.rules`**: Reglas de seguridad que controlan permisos de lectura y escritura en la base de datos Firestore.
* **`firestore.indexes.json`**: Definición de índices compuestos para optimizar consultas en Firestore.
* **`storage.rules`**: Reglas de seguridad para la subida y descarga de archivos adjuntos en Firebase Storage.
* **`eslint.config.js`**: Reglas de estilo y prevención de errores de sintaxis en JavaScript/React.
* **`README.md`**: Esta documentación del proyecto.

---

### 3. Código Fuente de la Aplicación (`antigravity-finance/src/`)

#### Archivos de Entrada
* **`main.jsx`**: Punto de arranque de la aplicación. Inicializa el entorno e inserta `<App />` en el DOM de `index.html`.
* **`App.jsx`**: Enrutador central (`react-router-dom`), protección de rutas privadas mediante login y estructura general.
* **`index.css`**: Hoja de estilos globales, variables de color CSS e importaciones de Tailwind CSS.
* **`App.css`**: Estilos auxiliares para animaciones, fuentes y diseño del layout.

#### Subcarpetas de `src/`

##### 📁 `assets/` (Recursos Gráficos)
* **`hero.png`**, **`react.svg`**, **`vite.svg`**: Logotipos e ilustraciones utilizados en las pantallas principales.

##### 📁 `context/` (Estado Global de Sesión)
* **`AuthContext.jsx`**: Contexto React que centraliza la sesión de usuario (inicio de sesión, registro, recuperación de contraseña, logout y permisos con Firebase Auth).

##### 📁 `firebase/` (Conexión a la Nube)
* **`config.js`**: Inicialización del SDK de Firebase conectando con Auth, Firestore y Storage mediante las credenciales del proyecto.

##### 📁 `data/` (Datos Maestros)
* **`pgcAccounts.js`**: Catálogo base del Plan General Contable (cuentas de 4 y más dígitos, descripciones contables y naturalezas Debe/Haber).

##### 📁 `services/` (Lógica de Negocio y Datos)
* **`accounting.js`**: Operaciones contables: creación y validación de asientos, comprobación del cuadre Debe/Haber y cálculo de saldos.
* **`migrationService.js`**: Lógica de sincronización y migración entre almacenamiento local y la base de datos en la nube.
* **`seed.js`**: Carga de datos de prueba o iniciales para configurar la estructura base.

##### 📁 `hooks/` (Lógica Reutilizable)
* **`useTableFilters.jsx`**: Hook para filtrado rápido y búsqueda multicriterio en las tablas de la app.
* **`useTableColumns.jsx`**: Gestión de columnas visibles, ordenación y preferencias por usuario.
* **`useDragResize.jsx`**: Control dinámico del redimensionamiento de paneles y barras laterales arrastrando el ratón.
* **`useRvHistoricalData.js`**: Cálculo y preparación de series históricas y métricas de rentabilidad para Renta Variable.

##### 📁 `utils/` (Utilidades Auxiliares)
* **`exportUtils.js`**: Exportación de datos de tablas a archivos Excel (`.xlsx`) y CSV.
* **`pdfExport.js`**: Generación e impresión de informes contables y fichas en PDF con `jspdf`.
* **`storageUtils.js`**: Subida, descarga y gestión de URLs públicas de justificantes y facturas en Firebase Storage.
* **`defaultData.js`**: Valores y plantillas por defecto para nuevos formularios.

##### 📁 `components/` (Modales, Pestañas e Interfaz)
* **`Layout.jsx`**: Marco común de la aplicación con la barra lateral de navegación, cabecera y accesos directos.
* **`Window.jsx`**: Ventana modal flotante y arrastrable tipo sistema operativo.
* **`ResizableSidebar.jsx`**: Barra lateral con ancho regulable mediante arrastre.
* **`AccountingEntryModal.jsx`**: Ventana modal para introducir o editar asientos contables.
* **`BankReconciliationModal.jsx`**: Modal para conciliación bancaria con extractos.
* **`PunteoModal.jsx`**: Herramienta de punteo de partidas contables pendientes.
* **`ClosingModule.jsx`**: Módulo de regularización y cierre contable de fin de ejercicio.
* **`TaxesExtractModal.jsx`**: Ventana de desglose fiscal detallado.
* **Pestañas del Módulo Inmobiliario:**
  * **`ExtractoContableTab.jsx`**: Pestaña del extracto de cuentas y desglose por grupo 6 y 7.
  * **`ExtractoTab.jsx`**: Extracto general de movimientos.
  * **`HipotecaTab.jsx`**: Cuadros de amortización y datos hipotecarios.
  * **`FinanzasTab.jsx`**: Resumen financiero del inmueble.
  * **`TaxTab.jsx`**: Impuestos vinculados a la propiedad.
  * **`ReformasTab.jsx`**: Control de costes de reformas y mejoras.
  * **`ServiciosTab.jsx`**: Suministros y servicios asociados (luz, agua, internet).
  * **`ComunidadTab.jsx`**: Cuotas y derramas de comunidad.
  * **`PropietariosTab.jsx`**: Datos de copropietarios y porcentajes.
  * **`ClienteTab.jsx`**: Datos del inquilino o cliente asignado.
* **Componentes Generales:**
  * **`SettingsModal.jsx`**: Ventana modal de configuración.
  * **`EditableCell.jsx`**: Celda de tabla editable en línea.
  * **`ErrorBoundary.jsx`**: Captura de errores inesperados de React para evitar caídas de la interfaz.
  * **`ZoomControl.jsx`**: Control de ampliación/reducción de escala visual.
  * **`CustomIcons.jsx`**: Colección de iconos vectoriales personalizados.

##### 📁 `pages/` (Vistas y Pantallas Completas)
* **Inicio y Autenticación:**
  * **`Home.jsx`**: Pantalla de inicio y bienvenida.
  * **`Dashboard.jsx`**: Panel de control con métricas clave y resúmenes.
  * **`Settings.jsx`**: Ajustes generales, sincronización de datos y configuración del sistema.
  * **`PrintPage.jsx`**: Pantalla especializada para la impresión de informes y gráficos.
  * **`Login.jsx`**, **`Register.jsx`**, **`ResetPassword.jsx`**: Inicio de sesión, registro de nuevos usuarios y restablecimiento de contraseña.
* **Módulo Contable:**
  * **`JournalEntry.jsx`**: Creación y edición manual de asientos en el libro diario.
  * **`JournalList.jsx`**: Libro Diario con listado y filtrado de todos los asientos.
  * **`Ledger.jsx`**: Libro Mayor con vista de movimientos agrupados por cuenta.
  * **`TrialBalance.jsx`**: Balance de Comprobación de Sumas y Saldos.
  * **`Accounts.jsx`**: Gestión del catálogo de cuentas y subcuentas contables.
  * **`AnalyticalCenters.jsx`**: Centros de coste (CECO) y de beneficio (CEBE).
  * **`Analitica.jsx`** y **`AnaliticaAssociations.jsx`**: Informes y asignaciones de analítica de costes.
  * **`Importer.jsx`**: Asistente para importar extractos bancarios y contables desde Excel.
* **Módulo Inmobiliario:**
  * **`RealEstate.jsx`**: Gestión integral de inmuebles con fichas técnicas y desglose por pestañas.
  * **`Rentals.jsx`**: Gestión de alquileres, cobros y contratos vigentes.
  * **`Customers.jsx`**: Directorio de clientes e inquilinos.
  * **`Partners.jsx`**: Gestión de socios y porcentajes de titularidad.
* **Módulo de Renta Variable (RV) y Broker:**
  * **`Portfolio.jsx`**: Cartera de inversión en renta variable en tiempo real.
  * **`Broker.jsx`**: Entidades financieras y cuentas de valores.
  * **`RvAssets.jsx`**: Catálogo de activos (acciones, fondos, ETFs).
  * **`RvTransactions.jsx`**: Registro de operaciones (compras, ventas, dividendos).
  * **`RvMetrics.jsx`**: Gráficos evolutivos de rentabilidad y evolución patrimonial.
* **Módulo de Crowdfunding (CF):**
  * **`CfPortfolio.jsx`**: Cartera de proyectos de inversión participativa.
  * **`CfEmpresas.jsx`**: Plataformas y empresas de crowdfunding.
  * **`CfActivos.jsx`**: Fichas individuales de proyectos o préstamos CF.
  * **`CfTransactions.jsx`**: Historial de aportaciones, cobros y liquidaciones en CF.
* **Módulo Fiscal (Impuestos):**
  * **`TaxesTotal.jsx`**: Cuadro de mando fiscal consolidado.
  * **`TaxesRealEstate.jsx`**: Liquidaciones e impuestos de la actividad inmobiliaria.
  * **`TaxesRv.jsx`**: Fiscalidad de plusvalías y dividendos de renta variable.
  * **`TaxesCf.jsx`**: Fiscalidad de rendimientos de crowdfunding.
* **Módulo Laboral:**
  * **`LaboralEmpresas.jsx`**: Empresas empleadoras y centros de trabajo.
  * **`LaboralContratos.jsx`**: Contratos de trabajo, nóminas y condiciones de empleados.
