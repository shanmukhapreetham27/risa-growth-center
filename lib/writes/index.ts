export { type Actor, WriteError, stamp } from "./common";
export { changeOpportunity, installmentTerms, splitRemaining, BALANCE_DUE_DEFAULT, type OpportunityChange, type OpportunityChangeResult } from "./opportunity";
export { recordPayment, type RecordPaymentInput, type RecordPaymentResult } from "./payments";
export {
  changeQualification, logInteraction, createOpportunity, changeTargets, updateCampaign, createCampaign,
  setCampaignBudget, addSpend, createTask, updateTask, deleteTask, updateSettings,
} from "./entities";
