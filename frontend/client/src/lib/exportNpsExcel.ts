import * as XLSX from "xlsx";
import {
  buildNpsExcelWorkbook,
  sanitizeNpsExportFilenameSegment,
  type NpsExportType,
} from "@shared/npsExcel";

export type AdminNpsApiResponse = {
  npsType: NpsExportType;
  count: number;
  rows: Record<string, string>[];
};

export function downloadNpsResponsesExcel(
  response: AdminNpsApiResponse,
  eventTitle: string,
): void {
  const wb = buildNpsExcelWorkbook(response.rows, response.npsType, eventTitle);
  const segment = sanitizeNpsExportFilenameSegment(eventTitle);
  XLSX.writeFile(wb, `nps-${segment}.xlsx`);
}
