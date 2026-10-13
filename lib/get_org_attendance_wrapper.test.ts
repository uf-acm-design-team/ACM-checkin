import { getOrgAttendance } from './get_org_attendance_wrapper';


async function runTest() {
  try {
    const testOrgId = '8b0dba6e-7a99-4f44-b00b-60cd1590a6b8';
    const startTime = '2026-10-12 00:00:00';
    const endTime = '2026-10-13 00:00:00';

    console.log('Fetching attendance...');
    const data = await getOrgAttendance(testOrgId, startTime, endTime);
    console.log('Success! Result:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTest();  