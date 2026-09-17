// Copy for the application shell chrome: appearance, destination search, sidebar collapse,
// breadcrumbs and the signed-in home hub. Same shape as every features/*/copy.ts module, so
// catalogs.unit.test.ts key parity and the Arabic-script checks apply here too.
export const shellEn = {
  'theme.label': 'Appearance',
  'theme.light': 'Light appearance',
  'theme.dark': 'Dark appearance',
  'theme.system': 'Match my device',
  'search.open': 'Search sections',
  'search.title': 'Go to a section',
  'search.placeholder': 'Type a section name',
  'search.empty': 'No section matches that name.',
  'search.results': 'Sections you can open',
  'shell.collapse': 'Collapse the menu',
  'shell.expand': 'Expand the menu',
  'shell.breadcrumb': 'Page location',
  'shell.home': 'Home',
  'home.welcome': 'Welcome back, {name}',
  'home.subtitle': 'Everything you need to keep the nursery running, and every child learning and growing safely.',
  'home.quickActions': 'Your sections',
  'home.quickActionsHelp': 'Only the sections your account is allowed to open are shown here.',
  'home.account': 'Your account',
  'home.openSection': 'Open'
} as const;

export const shellAr: Record<keyof typeof shellEn, string> = {
  'theme.label': 'شكل الواجهة',
  'theme.light': 'واجهة فاتحة',
  'theme.dark': 'واجهة غامقة',
  'theme.system': 'زي إعدادات الجهاز',
  'search.open': 'دوّر على قسم',
  'search.title': 'روح لقسم',
  'search.placeholder': 'اكتب اسم القسم',
  'search.empty': 'مفيش قسم بالاسم ده.',
  'search.results': 'الأقسام اللي تقدر تفتحها',
  'shell.collapse': 'صغّر القائمة',
  'shell.expand': 'كبّر القائمة',
  'shell.breadcrumb': 'مكانك في الموقع',
  'shell.home': 'الرئيسية',
  'home.welcome': 'أهلاً بيك تاني يا {name}',
  'home.subtitle': 'كل اللي محتاجه عشان الحضانة تمشي صح، وكل طفل يتعلم ويكبر في أمان.',
  'home.quickActions': 'الأقسام بتاعتك',
  'home.quickActionsHelp': 'مش هيظهر هنا غير الأقسام اللي حسابك مسموح له يفتحها.',
  'home.account': 'حسابك',
  'home.openSection': 'افتح'
};
