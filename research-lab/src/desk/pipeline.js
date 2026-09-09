import { rankDesk, researchDesk, writeDesk, editDesk, assembleDesk } from './stages.js';
export async function generateDesk({ date, sources, recent = [], memory = [], invoke, models }) {
  const ranked = await rankDesk({ date, sources, recent, memory, invoke, model: models.discovery });
  const researched = await researchDesk({ selected: ranked.selected, sources, memory, invoke, model: models.research });
  const written = await writeDesk({ date, ...ranked, ...researched, recent, memory, invoke, model: models.writer });
  const review = await editDesk({ ...written, ...researched, recent, invoke, model: models.editor });
  return assembleDesk({ ...ranked, ...researched, ...written, review, recent, memory, models });
}
