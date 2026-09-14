export const financeEn = {
 'finance.title':'Treasury accounts','finance.create':'Create account','finance.branch':'Branch','finance.code':'Account code','finance.name':'Account name','finance.type':'Destination','finance.CASH':'Cash','finance.BANK':'Bank','finance.WALLET':'Wallet',
 'finance.opening':'Opening balance (EGP)','finance.date':'Opening date','finance.reason':'Opening balance reason','finance.default':'Default cash account','finance.makeDefault':'Use as default cash account','finance.saved':'Account saved.','finance.empty':'No treasury accounts configured.',
 'finance.help':'Enter the actual opening balance. The first account in each branch must be cash. Bank and wallet receipts go directly to their selected account.',
 'finance.invalid':'Check the amounts, dates, destination and remaining balance.','finance.disabled':'Finance is disabled. Existing staff history remains available.','finance.operationConflict':'This operation ID was already used with different details.',
 'finance.uncertain':'The result is uncertain. Check the operation before making another change.','finance.check':'Check saved operation','finance.notFound':'No committed operation found. Retry the same saved request.','finance.retry':'Retry saved request',
 'organization.cap.finance.read':'Read financial records','organization.cap.billing.manage':'Manage obligations','organization.cap.payments.record':'Record external payments','organization.cap.treasury.manage':'Configure treasury accounts'
} as const;
export const financeAr:Record<keyof typeof financeEn,string> = {
 'finance.title':'حسابات الخزينة','finance.create':'إنشاء حساب','finance.branch':'الفرع','finance.code':'كود الحساب','finance.name':'اسم الحساب','finance.type':'وجهة التحصيل','finance.CASH':'نقدي','finance.BANK':'بنك','finance.WALLET':'محفظة',
 'finance.opening':'الرصيد الافتتاحي (جنيه)','finance.date':'تاريخ الافتتاح','finance.reason':'سبب الرصيد الافتتاحي','finance.default':'الحساب النقدي الافتراضي','finance.makeDefault':'اختيار كحساب نقدي افتراضي','finance.saved':'تم حفظ الحساب.','finance.empty':'مفيش حسابات خزينة متسجلة.',
 'finance.help':'اكتب الرصيد الافتتاحي الفعلي. أول حساب في كل فرع لازم يكون نقدي. تحصيلات البنك والمحفظة بتتسجل في الحساب المختار مباشرة.',
 'finance.invalid':'راجع المبالغ والتواريخ والحساب والرصيد المتبقي.','finance.disabled':'الماليات متوقفة. السجلات السابقة متاحة للموظف المصرح له.','finance.operationConflict':'رقم العملية اتستخدم قبل كده بتفاصيل مختلفة.',
 'finance.uncertain':'نتيجة العملية مش مؤكدة. راجع العملية قبل أي تغيير جديد.','finance.check':'راجع العملية المحفوظة','finance.notFound':'مفيش عملية مكتملة. أعد نفس الطلب المحفوظ.','finance.retry':'إعادة الطلب المحفوظ',
 'organization.cap.finance.read':'عرض السجلات المالية','organization.cap.billing.manage':'إدارة المستحقات','organization.cap.payments.record':'تسجيل التحصيل الخارجي','organization.cap.treasury.manage':'إعداد حسابات الخزينة'
};
