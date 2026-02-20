import type { LoadedTool } from './toolConfig.js';
import { janiceMarketsTool } from './builtins/markets.js';
import { pricerTool } from './builtins/pricer.js';

export const builtinTools: LoadedTool[] = [pricerTool, janiceMarketsTool];
