import { prisma } from 'prisma/prisma'
import type { LaborCalculationInput } from '@/@types/labor-calculation'
import { ResourceNotFoundException } from '@/http/exceptions/resource-not-found-exception'
import { requireOrganizationId } from '@/lib/tenant-context'
import type { TenantActor } from '@/services/tenant/actor'
import { calculationVisibility } from '@/services/tenant/visibility'
import { calculateLaborV2 } from './labor-calculation-v2'

export async function createLaborCalculationService(
  userId: string,
  input: LaborCalculationInput,
) {
  const result = calculateLaborV2(input)

  return prisma.laborCalculation.create({
    data: {
      userId,
      organizationId: requireOrganizationId(),
      clientName: input.clientName,
      clientDocument: input.clientDocument ?? null,
      observations: input.observations ?? null,
      calculationVersion: 'v2',
      terminationType: input.terminationType,
      status: input.status ?? 'em_andamento',
      startDate: input.startDate,
      endDate: input.endDate,
      lastSalary: input.lastSalary,
      baseSalary: input.baseSalary,
      unpaid13ths: input.unpaid13ths,
      vacationCount: input.vacationCount,
      vacationVencidasCount: input.vacationVencidasCount,
      priorNoticeWorked: input.priorNoticeWorked,
      priorNoticeDate: input.priorNoticeDate ?? null,
      extraHours: input.extraHours,
      nightHours: input.nightHours,
      insalubrityLevel: input.insalubrityLevel,
      dangerousWork: input.dangerousWork,
      applyArt477Fine: input.applyArt477Fine,
      lastThreeSalariesAvg: input.lastThreeSalariesAvg,
      priorNoticeValue: result.priorNoticeValue,
      thirteenthSalaryValue: result.thirteenthSalaryValue,
      vacationValue: result.vacationValue,
      fgtsValue: result.fgtsValue,
      fgtsFineValue: result.fgtsFineValue,
      unemploymentInsuranceValue: result.unemploymentInsuranceValue,
      extraHoursValue: result.extraHoursValue,
      nightAdditionalValue: result.nightAdditionalValue,
      insalubrityValue: result.insalubrityValue,
      dangerousWorkValue: result.dangerousWorkValue,
      art477FineValue: result.art477FineValue,
      totalValue: result.totalValue,
      reflexo13thValue: result.reflexo13thValue,
      reflexoVacationValue: result.reflexoVacationValue,
      reflexoFGTSValue: result.reflexoFGTSValue,
      reflexoMultaFGTSValue: result.reflexoMultaFGTSValue,
      doubleVacationValue: result.doubleVacationValue,
    },
  })
}

export async function updateLaborCalculationService(
  actor: TenantActor,
  id: string,
  input: Partial<LaborCalculationInput>,
) {
  const existing = await prisma.laborCalculation.findFirst({
    where: { id, ...calculationVisibility(actor) },
  })

  if (!existing) {
    throw new ResourceNotFoundException()
  }

  const mergedInput: LaborCalculationInput = {
    clientName: input.clientName ?? existing.clientName,
    clientId: input.clientId ?? existing.clientId ?? undefined,
    clientDocument:
      input.clientDocument ?? existing.clientDocument ?? undefined,
    observations: input.observations ?? existing.observations ?? undefined,
    startDate: input.startDate ?? existing.startDate ?? new Date(),
    endDate: input.endDate ?? existing.endDate ?? new Date(),
    lastSalary: input.lastSalary ?? Number(existing.lastSalary),
    baseSalary: input.baseSalary ?? Number(existing.baseSalary),
    unpaid13ths: input.unpaid13ths ?? Number(existing.unpaid13ths),
    vacationCount: input.vacationCount ?? existing.vacationCount,
    vacationVencidasCount:
      input.vacationVencidasCount ?? existing.vacationVencidasCount,
    priorNoticeWorked:
      input.priorNoticeWorked ?? existing.priorNoticeWorked ?? false,
    priorNoticeDate:
      input.priorNoticeDate ?? existing.priorNoticeDate ?? undefined,
    extraHours: input.extraHours ?? Number(existing.extraHours),
    nightHours: input.nightHours ?? Number(existing.nightHours),
    insalubrityLevel: (input.insalubrityLevel ??
      existing.insalubrityLevel ??
      0) as 0 | 10 | 20 | 40,
    dangerousWork: input.dangerousWork ?? existing.dangerousWork ?? false,
    lastThreeSalariesAvg:
      input.lastThreeSalariesAvg ?? Number(existing.lastThreeSalariesAvg),
    terminationType: (input.terminationType ??
      existing.terminationType) as LaborCalculationInput['terminationType'],
    applyArt477Fine: input.applyArt477Fine ?? existing.applyArt477Fine ?? false,
  }

  const result = calculateLaborV2(mergedInput)

  return prisma.laborCalculation.update({
    where: { id },
    data: {
      clientName: input.clientName,
      clientDocument: input.clientDocument ?? null,
      clientId: mergedInput.clientId,
      observations: input.observations ?? null,
      terminationType: input.terminationType,
      status: input.status,
      startDate: mergedInput.startDate,
      endDate: mergedInput.endDate,
      lastSalary: mergedInput.lastSalary,
      baseSalary: mergedInput.baseSalary,
      unpaid13ths: mergedInput.unpaid13ths,
      vacationCount: mergedInput.vacationCount,
      vacationVencidasCount: mergedInput.vacationVencidasCount,
      priorNoticeWorked: mergedInput.priorNoticeWorked,
      priorNoticeDate: mergedInput.priorNoticeDate ?? null,
      extraHours: mergedInput.extraHours,
      nightHours: mergedInput.nightHours,
      insalubrityLevel: mergedInput.insalubrityLevel,
      dangerousWork: mergedInput.dangerousWork,
      applyArt477Fine: mergedInput.applyArt477Fine,
      lastThreeSalariesAvg: mergedInput.lastThreeSalariesAvg,
      priorNoticeValue: result.priorNoticeValue,
      thirteenthSalaryValue: result.thirteenthSalaryValue,
      vacationValue: result.vacationValue,
      fgtsValue: result.fgtsValue,
      fgtsFineValue: result.fgtsFineValue,
      unemploymentInsuranceValue: result.unemploymentInsuranceValue,
      extraHoursValue: result.extraHoursValue,
      nightAdditionalValue: result.nightAdditionalValue,
      insalubrityValue: result.insalubrityValue,
      dangerousWorkValue: result.dangerousWorkValue,
      art477FineValue: result.art477FineValue,
      totalValue: result.totalValue,
      reflexo13thValue: result.reflexo13thValue,
      reflexoVacationValue: result.reflexoVacationValue,
      reflexoFGTSValue: result.reflexoFGTSValue,
      reflexoMultaFGTSValue: result.reflexoMultaFGTSValue,
      doubleVacationValue: result.doubleVacationValue,
    },
  })
}
