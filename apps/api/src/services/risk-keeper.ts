import { nowUnix } from "../lib/time";
import { ContractGateway } from "./contract-gateway";
import { ReadModelService } from "./read-model";

export class RiskKeeperService {
  public constructor(
    private readonly gateway: ContractGateway,
    private readonly readModel: ReadModelService
  ) {}

  public async runOnce(currentUnix = nowUnix()): Promise<{ settled: number }> {
    let settled = 0;
    const plans = this.gateway.listAllPlans();
    for (const plan of plans) {
      const previousStatus = plan.status;
      const next = await this.gateway.settleRisk(plan.planId, currentUnix);
      if (next.status !== previousStatus) {
        settled += 1;
      }
    }

    await this.readModel.sync();
    return { settled };
  }
}
