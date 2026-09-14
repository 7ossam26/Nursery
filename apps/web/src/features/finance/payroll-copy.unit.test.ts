import { it,expect } from 'vitest';
import { translate } from '../../i18n/catalogs.js';
it('payroll action and error copy exists in English and Egyptian Arabic',()=>{
 for(const key of ['payroll.amountChanged','payroll.zeroSettle','payroll.confirm','payroll.loginHelp','payroll.provisionLogin','organization.cap.payroll.pay','licensing.module.PAYROLL'] as const){expect(translate('en',key)).not.toBe(key);expect(translate('ar-EG',key)).not.toBe(key);expect(translate('ar-EG',key)).not.toBe(translate('en',key));}
});
