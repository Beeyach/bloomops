// Registers the JSX/alias hooks. Render tests import this FIRST:
//   import './_jsx.mjs';
import { register } from 'node:module';
register('./_jsx-hooks.mjs', import.meta.url);
