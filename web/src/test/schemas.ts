// Tests read the shared schemas in /data directly (never copied or edited).
import household from '../../../data/household.json'
import vaccination from '../../../data/vaccination-visit.json'
import complaint from '../../../data/complaint.json'
import type { FormSchema } from '../engine/types'

export const householdSchema = household as unknown as FormSchema
export const vaccinationSchema = vaccination as unknown as FormSchema
export const complaintSchema = complaint as unknown as FormSchema
