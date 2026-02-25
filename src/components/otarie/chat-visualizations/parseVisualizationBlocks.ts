import type { ChartBlock } from './InlineChart';
import type { MapBlock } from './InlineMap';
import type { KPIBlock } from './InlineKPICards';

export type VizBlock =
  | { type: 'markdown'; content: string }
  | { type: 'chart'; config: ChartBlock }
  | { type: 'map'; config: MapBlock }
  | { type: 'kpi'; config: KPIBlock };

/**
 * Parses AI response content to extract visualization blocks.
 * The AI emits fenced code blocks with language tags: ```chart, ```map, ```kpi
 * containing JSON configurations.
 */
export function parseVisualizationBlocks(content: string): VizBlock[] {
  const blocks: VizBlock[] = [];
  // Match ```chart {...} ```, ```map {...} ```, ```kpi {...} ```
  const regex = /```(chart|map|kpi)\s*\n([\s\S]*?)```/g;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Add markdown before this block
    if (match.index > lastIndex) {
      const md = content.slice(lastIndex, match.index).trim();
      if (md) blocks.push({ type: 'markdown', content: md });
    }

    const blockType = match[1] as 'chart' | 'map' | 'kpi';
    const jsonStr = match[2].trim();

    try {
      const config = JSON.parse(jsonStr);
      blocks.push({ type: blockType, config });
    } catch {
      // If JSON parse fails, treat as markdown
      blocks.push({ type: 'markdown', content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining markdown after last block
  if (lastIndex < content.length) {
    const md = content.slice(lastIndex).trim();
    if (md) blocks.push({ type: 'markdown', content: md });
  }

  // If no viz blocks found, return single markdown block
  if (blocks.length === 0) {
    return [{ type: 'markdown', content }];
  }

  return blocks;
}
