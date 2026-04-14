import algosdk from "algosdk";

export const MARKETPLACE_PLAN_BOX_LOOKAHEAD = 7;

const USER_BOX_PREFIX = Buffer.from("user_");
const PLAN_BOX_PREFIX = Buffer.from("plan_");
const PLAN_ID_BYTE_LENGTH = 8;

export interface MarketplaceBoxReference {
  appIndex: number;
  name: Uint8Array;
}

export interface MarketplacePlanBoxWindow {
  userBoxName: Uint8Array;
  firstPlanId: number;
  lastPlanId: number;
  boxReferences: MarketplaceBoxReference[];
}

export const buildUserBoxName = (borrowerAddress: string): Uint8Array =>
  new Uint8Array(
    Buffer.concat([
      USER_BOX_PREFIX,
      Buffer.from(algosdk.decodeAddress(borrowerAddress).publicKey)
    ])
  );

export const buildPlanBoxName = (planId: number): Uint8Array => {
  const planIdBytes = Buffer.alloc(PLAN_ID_BYTE_LENGTH);
  planIdBytes.writeBigUInt64BE(BigInt(planId));
  return new Uint8Array(Buffer.concat([PLAN_BOX_PREFIX, planIdBytes]));
};

export const decodePlanIdFromBoxName = (boxName: Uint8Array): number | null => {
  const encoded = Buffer.from(boxName);
  if (encoded.length !== PLAN_BOX_PREFIX.length + PLAN_ID_BYTE_LENGTH) {
    return null;
  }

  if (!encoded.subarray(0, PLAN_BOX_PREFIX.length).equals(PLAN_BOX_PREFIX)) {
    return null;
  }

  const planId = encoded.readBigUInt64BE(PLAN_BOX_PREFIX.length);
  if (planId > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  return Number(planId);
};

export const buildMarketplacePlanBoxWindow = (
  bnplAppId: number,
  borrowerAddress: string,
  firstPlanId: number,
  planBoxCount = MARKETPLACE_PLAN_BOX_LOOKAHEAD
): MarketplacePlanBoxWindow => {
  const userBoxName = buildUserBoxName(borrowerAddress);
  const safePlanBoxCount = Math.max(1, planBoxCount);
  const planBoxReferences = Array.from({ length: safePlanBoxCount }, (_, index) => {
    const planId = firstPlanId + index;
    return {
      appIndex: bnplAppId,
      name: buildPlanBoxName(planId)
    };
  });

  return {
    userBoxName,
    firstPlanId,
    lastPlanId: firstPlanId + safePlanBoxCount - 1,
    boxReferences: [
      {
        appIndex: bnplAppId,
        name: userBoxName
      },
      ...planBoxReferences
    ]
  };
};
