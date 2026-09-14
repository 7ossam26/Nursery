import type { ImportErrorCode,ImportKind } from './imports.js';
type Pair=readonly [string,string];
export const importKindTitles:Record<ImportKind,Pair>={PARENTS_CHILDREN:['Parents, children and links','أولياء الأمور والأطفال والروابط'],OPENING_BALANCES:['Opening unpaid child balances','الأرصدة الافتتاحية غير المدفوعة للأطفال'],EMPLOYEES:['Employee profiles and basic salaries','ملفات الموظفين والمرتبات الأساسية']};
export const importSheetTitles:Record<string,Pair>={Parents:['Parents','أولياء الأمور'],Children:['Children','الأطفال'],Links:['Links','الروابط'],Balances:['Balances','الأرصدة'],Employees:['Employees','الموظفون'],Reference:['Reference codes','الأكواد المرجعية'],Guide:['Guide','الدليل'],Template:['Template','القالب']};
// Column key -> [English description, Egyptian Arabic description]; the header row keeps the stable machine key.
export const importColumnHelp:Record<string,Pair>={
 parent_key:['Your own stable key for this parent (for example P1). Reuse the same key on every child link; one account is created per key.','مفتاح ثابت من عندك لولي الأمر (مثلاً P1). استخدم نفس المفتاح في كل رابط طفل؛ بيتعمل حساب واحد لكل مفتاح.'],
 username:['New login username, 3–64 letters/digits/._- ; must not already exist.','اسم مستخدم جديد للدخول من 3 لـ64 حرف/رقم/._- ؛ لازم يكون مش موجود قبل كده.'],
 full_name:['Full name (1–160 characters).','الاسم الكامل (من 1 لـ160 حرف).'],
 mobile:['Mobile number, digits with optional +, spaces or dashes (at least 7 digits).','رقم الموبايل، أرقام مع + أو مسافات أو شرط اختياري (7 أرقام على الأقل).'],
 child_code:['Stable child code, uppercase letters/digits/_- up to 32 characters; must not already exist.','كود الطفل الثابت، حروف كبيرة/أرقام/_- لحد 32 حرف؛ لازم يكون مش موجود قبل كده.'],
 birth_date:['Birth date as YYYY-MM-DD, dd/MM/yyyy or an Excel date; not in the future.','تاريخ الميلاد بصيغة YYYY-MM-DD أو dd/MM/yyyy أو تاريخ إكسل؛ مش في المستقبل.'],
 branch_code:['Branch code from the Reference sheet, within your permitted branches.','كود الفرع من ورقة الأكواد المرجعية، ضمن الفروع المسموح بيها ليك.'],
 classroom_code:['Optional classroom code (Reference sheet) belonging to the same branch.','كود الفصل اختياري (ورقة الأكواد المرجعية) وتابع لنفس الفرع.'],
 contact_name:['Optional secondary contact name; requires contact_mobile and contact_relationship.','اسم جهة اتصال إضافية اختياري؛ محتاج contact_mobile و contact_relationship.'],
 contact_mobile:['Secondary contact mobile.','موبايل جهة الاتصال الإضافية.'],
 contact_relationship:['Secondary contact relationship (1–80 characters).','صلة جهة الاتصال الإضافية (من 1 لـ80 حرف).'],
 relationship:['Guardian relationship to the child, for example Mother or Father.','صلة ولي الأمر بالطفل، مثلاً أم أو أب.'],
 can_read:['Yes/No — guardian may read this child (default Yes).','نعم/لا — ولي الأمر يقدر يشوف بيانات الطفل (الافتراضي نعم).'],
 can_finance:['Yes/No — guardian may see this child\'s fees (default No).','نعم/لا — ولي الأمر يقدر يشوف مصروفات الطفل (الافتراضي لا).'],
 can_pickup:['Yes/No — guardian may collect the child (default No).','نعم/لا — ولي الأمر يقدر يستلم الطفل (الافتراضي لا).'],
 can_notify:['Yes/No — guardian receives notifications (default Yes).','نعم/لا — ولي الأمر يستلم الإشعارات (الافتراضي نعم).'],
 category_code:['Fee category code from the Reference sheet.','كود فئة الرسوم من ورقة الأكواد المرجعية.'],
 amount_egp:['Outstanding amount in EGP with at most two decimals, greater than zero. Creates debt only; never a payment or cash.','المبلغ المستحق بالجنيه برقمين عشريين على الأكثر وأكبر من صفر. بيعمل مديونية بس؛ مش دفع ولا نقدية.'],
 description:['Debt description shown on statements (1–120 characters).','وصف المديونية اللي بيظهر في الكشوف (من 1 لـ120 حرف).'],
 issued_on:['Date the debt was originally issued; not in the future.','تاريخ إصدار المديونية الأصلي؛ مش في المستقبل.'],
 due_on:['Due date of the outstanding amount; on or after issued_on.','تاريخ استحقاق المبلغ؛ في أو بعد issued_on.'],
 employee_code:['Stable employee code, uppercase letters/digits/_- up to 32 characters; must not already exist.','كود الموظف الثابت، حروف كبيرة/أرقام/_- لحد 32 حرف؛ لازم يكون مش موجود قبل كده.'],
 basic_salary_egp:['Basic monthly salary in EGP, greater than zero, at most two decimals.','المرتب الشهري الأساسي بالجنيه، أكبر من صفر، برقمين عشريين على الأكثر.'],
 effective_month:['First month this salary applies, as YYYY-MM.','أول شهر يسري فيه المرتب، بصيغة YYYY-MM.'],
 paying_branch_code:['Branch that pays this employee (Reference sheet).','الفرع اللي بيدفع للموظف (ورقة الأكواد المرجعية).'],
 paying_account_code:['Treasury account code of the paying branch (Reference sheet).','كود حساب الخزينة التابع للفرع الدافع (ورقة الأكواد المرجعية).'],
 login_username:['Optional new login username; reserves one employee seat. Leave empty for a profile without login.','اسم مستخدم جديد اختياري؛ بيحجز مكان موظف واحد. سيبه فاضي لملف من غير دخول.'],
 role_name:['Optional role name assigned to the new login (Reference sheet lists roles you may assign).','اسم دور اختياري يتعين للدخول الجديد (ورقة الأكواد المرجعية فيها الأدوار المسموح لك تعينها).'],
 branch_codes:['Optional comma-separated branch codes for the new login\'s branch-wide access; requires role_name.','أكواد فروع اختيارية مفصولة بفاصلة لصلاحية الدخول الجديد على مستوى الفرع؛ محتاج role_name.']
};
export const importErrorHelp:Record<ImportErrorCode,Pair>={
 MISSING_SHEET:['Required sheet is missing.','ورقة مطلوبة ناقصة.'],HEADER_MISMATCH:['Header row does not match the template columns.','صف العناوين مش مطابق لأعمدة القالب.'],TOO_MANY_ROWS:['Too many rows; split the file into separate batches.','عدد الصفوف كبير؛ قسّم الملف لدفعات منفصلة.'],
 REQUIRED:['Required value is missing.','قيمة مطلوبة ناقصة.'],INVALID:['Value is not in the expected format.','القيمة مش بالصيغة المتوقعة.'],TOO_LONG:['Value is too long.','القيمة أطول من المسموح.'],FORMULA:['Formulas are not supported; enter plain values.','المعادلات مش مدعومة؛ اكتب قيم عادية.'],UNSUPPORTED_CELL:['Unsupported cell content.','محتوى الخلية غير مدعوم.'],
 DUPLICATE:['Duplicate value inside the file.','قيمة مكررة داخل الملف.'],EXISTS:['Already exists in the nursery records.','موجود بالفعل في سجلات الحضانة.'],UNKNOWN_REFERENCE:['Referenced code/key was not found.','الكود أو المفتاح المشار إليه مش موجود.'],OUT_OF_SCOPE:['Outside your permitted branches, classrooms or roles.','خارج الفروع أو الفصول أو الأدوار المسموح بيها ليك.'],
 UNLINKED:['Every parent and child needs at least one link row.','كل ولي أمر وكل طفل محتاج صف رابط واحد على الأقل.'],FAMILY_TOO_LARGE:['A linked family may have at most 4 parents and 10 children.','الأسرة المرتبطة ليها بحد أقصى 4 أولياء أمور و10 أطفال.'],CAPACITY:['Not enough reserved account slots for this batch.','مفيش أماكن حسابات محجوزة كفاية للدفعة دي.'],
 MODULE_DISABLED:['A required module is disabled.','في وحدة مطلوبة متقفلة.'],NOT_PERMITTED:['You lack a capability this batch needs.','ناقصك صلاحية محتاجاها الدفعة دي.']
};
export function importText(locale:'en'|'ar-EG',table:Record<string,Pair>,key:string):string {return table[key]?.[locale==='en'?0:1]??key;}
