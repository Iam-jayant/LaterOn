import type { LiquidityState, PlanRecord, UserProfile } from "@lateron/sdk";
import { ContractGateway } from "./contract-gateway";
import { PostgresMirror } from "../db/postgres-mirror";

interface ReadModelState {
  lastEventId: number;
  plansByWallet: Map<string, PlanRecord[]>;
  users: Map<string, UserProfile>;
  liquidity: LiquidityState;
}

export class ReadModelService {
  private readonly state: ReadModelState = {
    lastEventId: 0,
    plansByWallet: new Map(),
    users: new Map(),
    liquidity: {
      totalDepositsAlgo: 0,
      totalLentAlgo: 0,
      reserveAlgo: 0,
      availableAlgo: 0
    }
  };

  public constructor(
    private readonly gateway: ContractGateway,
    private readonly mirror?: PostgresMirror
  ) {}

  public async sync(): Promise<void> {
    const newEvents = this.gateway.listEvents(this.state.lastEventId);
    if (newEvents.length === 0) {
      return;
    }

    const plans = this.gateway.listAllPlans();
    const users = new Map<string, UserProfile>();
    const planMap = new Map<string, PlanRecord[]>();

    for (const plan of plans) {
      const rows = planMap.get(plan.walletAddress) ?? [];
      rows.push(plan);
      planMap.set(plan.walletAddress, rows);
      const user = await this.gateway.getOrCreateUser(plan.walletAddress);
      users.set(plan.walletAddress, user);
    }

    this.state.plansByWallet = planMap;
    this.state.users = users;
    this.state.liquidity = { ...this.gateway.getLiquidityState() };
    this.state.lastEventId = newEvents[newEvents.length - 1]?.id ?? this.state.lastEventId;

    if (this.mirror?.enabled) {
      await this.mirror.sync({
        users: this.gateway.listUsers(),
        plans: this.gateway.listAllPlans(),
        liquidity: this.gateway.getLiquidityState(),
        lastEventId: this.state.lastEventId
      });
    }
  }

  public getPlansByWallet(walletAddress: string): PlanRecord[] {
    return this.state.plansByWallet.get(walletAddress) ?? [];
  }

  public getUser(walletAddress: string): UserProfile | undefined {
    return this.state.users.get(walletAddress);
  }

  public getLiquidity(): LiquidityState {
    return this.state.liquidity;
  }

  public getLastEventId(): number {
    return this.state.lastEventId;
  }
}
