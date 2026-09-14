import { ExamService } from '../../apps/api/src/modules/exams/service.js';
import { learningFixture } from './learning.js';

export async function examsFixture(https = true) {
  const f = await learningFixture(https);
  try {
    const exams = new ExamService(f.children,f.learning,f.date);
    async function catalogItem(table: 'subjects' | 'exam_types',name: string) {
      return exams.saveCatalog(f.root.token,table,{ name,enabled: true });
    }
    return { ...f,exams,catalogItem };
  } catch (error) { await f.close(); throw error; }
}
