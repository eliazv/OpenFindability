import "dotenv/config";
import { getDoctorReport } from "@/lib/doctor";

async function main() {
  const report = await getDoctorReport();

  for (const check of report.checks) {
    const mark = check.status ? "OK" : check.required ? "MISS" : "WARN";
    console.log(`${mark}  ${check.name}: ${check.detail}`);
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
