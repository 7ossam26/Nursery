import { HomeworkService } from '../../apps/api/src/modules/homework/service.js';
import { learningFixture } from './learning.js';
export async function homeworkFixture(https = true) {
  const f=await learningFixture(https);
  return { ...f,homework: new HomeworkService(f.children,f.learning,f.date) };
}
