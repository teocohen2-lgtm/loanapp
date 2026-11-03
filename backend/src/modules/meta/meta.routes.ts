import { Router } from "express";
import {
  BANKS,
  DOCUMENT_REQUIREMENTS,
  ID_RULES,
  LOAN_LIMITS,
  PAYMENT_METHODS,
  REGULATORY_REFERENCE,
} from "../../config/ph";

export const metaRouter = Router();

// Public, static reference data used by the registration, KYC and loan screens.
metaRouter.get("/", (_req, res) => {
  res.json({
    currency: "PHP",
    currencySymbol: "₱",
    limits: LOAN_LIMITS,
    regulation: REGULATORY_REFERENCE,
    idTypes: ID_RULES.map(({ value, label, hint, placeholder }) => ({ value, label, hint, placeholder })),
    paymentMethods: PAYMENT_METHODS,
    banks: BANKS,
    documentRequirements: DOCUMENT_REQUIREMENTS,
  });
});
