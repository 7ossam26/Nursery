import { authFixture } from './auth.js';

export async function licensingFixture(https = true) {
  const fixture = await authFixture(https);
  try {
    const auth = fixture.app.auth; const licensing = fixture.app.licensing;
    await auth.bootstrap('licensing-system', fixture.secret);
    const setup = await auth.login('licensing-system', fixture.secret);
    const password = 'Licensing permanent root phrase 2026';
    const root = await auth.changePassword(setup.token, fixture.secret, password);
    return { ...fixture, root, password, licensing };
  } catch (error) { await fixture.close(); throw error; }
}

export const defaultLimitsInput = {
  parentCapacity: 2, employeeCapacity: 2, parentUnitPricePiastres: 10_000, employeeUnitPricePiastres: 5_000,
  subscriptionPeriod: 'MONTHLY' as const, startsOn: '2026-01-01', validUntil: '2026-12-31', graceDays: 7,
  agreedTotalOverridePiastres: null, agreedTotalOverrideReason: null, supportContact: null
};
