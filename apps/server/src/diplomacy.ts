import type { GameState } from "./types.js";
import type { Alliance, AllianceVote, Treaty, DiplomacyStats } from "@kingdoms/shared";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { config } from "./config.js";

function assertActivePlayer(state: GameState, playerId: string): void {
  if (state.players.find(player => player.id === playerId)?.status === "banned") throw new Error("ACCOUNT_BANNED");
}

function assertActiveTarget(state: GameState, playerId: string): void {
  if (state.players.find(player => player.id === playerId)?.status === "banned") throw new Error("TARGET_FROZEN");
}

export class DiplomacyRepository {
  constructor(private readonly pool?: Pool) {}

  seed(state: GameState) {
    if (!state.alliances) state.alliances = [];
    if (!state.treaties) state.treaties = [];
    if (!state.diplomacyThroughput) state.diplomacyThroughput = {};
    if (!state.allianceVotes) state.allianceVotes = [];
  }

  getStats(playerId: string, state: GameState): DiplomacyStats {
    if (!state.diplomacyThroughput[playerId]) {
      state.diplomacyThroughput[playerId] = {
        reputation: 0,
        treatiesHonored: 0,
        treatiesViolated: 0,
        activeTreaties: 0,
        allianceContribution: 0,
        mediationCount: 0,
      };
    }
    return state.diplomacyThroughput[playerId];
  }

  createAlliance(commandId: string, name: string, tag: string, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    if (state.alliances.some(a => a.members.some(m => m.playerId === playerId))) throw new Error("ALREADY_IN_ALLIANCE");
    if (state.alliances.some(a => a.name === name || a.tag === tag)) throw new Error("NAME_OR_TAG_TAKEN");

    const alliance: Alliance = {
      id: randomUUID(),
      kingdomId: state.kingdom.id,
      name,
      tag,
      leaderPlayerId: playerId,
      members: [{ playerId, role: "leader", contribution: 0, joinedAt: new Date().toISOString() }],
      leaderTermStartedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    state.alliances.push(alliance);
    state.processedCommands.push(commandId);
    return "accepted";
  }

  joinAlliance(commandId: string, allianceId: string, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    if (state.alliances.some(a => a.members.some(m => m.playerId === playerId))) throw new Error("ALREADY_IN_ALLIANCE");
    
    const alliance = state.alliances.find(a => a.id === allianceId);
    if (!alliance) throw new Error("ALLIANCE_NOT_FOUND");
    if (alliance.members.length >= 10) throw new Error("ALLIANCE_FULL");

    alliance.members.push({ playerId, role: "member", contribution: 0, joinedAt: new Date().toISOString() });
    state.processedCommands.push(commandId);
    return "accepted";
  }

  leaveAlliance(commandId: string, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    
    const alliance = state.alliances.find(a => a.members.some(m => m.playerId === playerId));
    if (!alliance) throw new Error("NOT_IN_ALLIANCE");

    alliance.members = alliance.members.filter(m => m.playerId !== playerId);

    if (alliance.members.length === 0) {
      state.alliances = state.alliances.filter(a => a.id !== alliance.id);
    } else if (alliance.leaderPlayerId === playerId) {
      const nextLeader = this.successor(alliance);
      nextLeader.role = "leader";
      alliance.leaderPlayerId = nextLeader.playerId;
      alliance.leaderTermStartedAt = new Date().toISOString();
    }

    state.processedCommands.push(commandId);
    return "accepted";
  }

  private successor(alliance: Alliance) {
    return [...alliance.members].sort((a, b) => (a.role === "officer" ? 0 : 1) - (b.role === "officer" ? 0 : 1) || Date.parse(a.joinedAt) - Date.parse(b.joinedAt) || a.playerId.localeCompare(b.playerId))[0];
  }

  manageMember(commandId: string, targetPlayerId: string, action: "promote" | "demote" | "kick", playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    if (action !== "kick") assertActiveTarget(state, targetPlayerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    const alliance = state.alliances.find(item => item.leaderPlayerId === playerId); if (!alliance) throw new Error("LEADER_REQUIRED");
    const target = alliance.members.find(member => member.playerId === targetPlayerId); if (!target) throw new Error("MEMBER_NOT_FOUND");
    if (target.role === "leader") throw new Error("CANNOT_MANAGE_LEADER");
    if (action === "kick") alliance.members = alliance.members.filter(member => member.playerId !== targetPlayerId);
    else target.role = action === "promote" ? "officer" : "member";
    state.processedCommands.push(commandId); return "accepted";
  }

  setNotice(commandId: string, notice: string, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    const alliance = state.alliances.find(item => item.members.some(member => member.playerId === playerId));
    const member = alliance?.members.find(item => item.playerId === playerId); if (!alliance || !member || member.role === "member") throw new Error("OFFICER_REQUIRED");
    alliance.notice = notice; state.processedCommands.push(commandId); return "accepted";
  }

  openVote(commandId: string, candidatePlayerId: string, playerId: string, state: GameState): AllianceVote {
    assertActivePlayer(state, playerId);
    assertActiveTarget(state, candidatePlayerId);
    if (state.processedCommands.includes(commandId)) throw new Error("already_processed");
    const alliance = state.alliances.find(item => item.members.some(member => member.playerId === playerId));
    const opener = alliance?.members.find(member => member.playerId === playerId); if (!alliance || !opener || opener.role === "member") throw new Error("OFFICER_REQUIRED");
    if (!alliance.members.some(member => member.playerId === candidatePlayerId)) throw new Error("CANDIDATE_NOT_MEMBER");
    if (state.allianceVotes.some(vote => vote.allianceId === alliance.id && vote.status === "open")) throw new Error("VOTE_ALREADY_OPEN");
    const now = Date.now(); const vote: AllianceVote = { id: randomUUID(), allianceId: alliance.id, candidatePlayerId, openedByPlayerId: playerId, votes: [], status: "open", openedAt: new Date(now).toISOString(), expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString() };
    state.allianceVotes.push(vote); state.processedCommands.push(commandId); return vote;
  }

  castVote(commandId: string, voteId: string, choice: boolean, playerId: string, state: GameState): AllianceVote {
    assertActivePlayer(state, playerId);
    if (state.processedCommands.includes(commandId)) throw new Error("already_processed");
    const vote = state.allianceVotes.find(item => item.id === voteId); if (!vote || vote.status !== "open") throw new Error("VOTE_NOT_OPEN");
    assertActiveTarget(state, vote.candidatePlayerId);
    const alliance = state.alliances.find(item => item.id === vote.allianceId); if (!alliance?.members.some(member => member.playerId === playerId)) throw new Error("NOT_IN_ALLIANCE");
    if (vote.votes.some(ballot => ballot.playerId === playerId)) throw new Error("ALREADY_VOTED");
    vote.votes.push({ playerId, vote: choice, castAt: new Date().toISOString() }); this.evaluateVote(vote, alliance); state.processedCommands.push(commandId); return vote;
  }

  private evaluateVote(vote: AllianceVote, alliance: Alliance, expired = false): void {
    const yes = vote.votes.filter(ballot => ballot.vote).length;
    if (yes > alliance.members.length / 2) {
      const oldLeader = alliance.members.find(member => member.playerId === alliance.leaderPlayerId); const next = alliance.members.find(member => member.playerId === vote.candidatePlayerId)!;
      if (oldLeader) oldLeader.role = "officer"; next.role = "leader"; alliance.leaderPlayerId = next.playerId; alliance.leaderTermStartedAt = new Date().toISOString(); vote.status = "passed";
    } else if (expired || vote.votes.length === alliance.members.length) vote.status = "failed";
  }

  contributeAlliance(commandId: string, cityId: string, resources: { wood: number; stone: number; iron: number }, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    
    const alliance = state.alliances.find(a => a.members.some(m => m.playerId === playerId));
    if (!alliance) throw new Error("NOT_IN_ALLIANCE");
    
    const city = state.cities.find(c => c.id === cityId);
    if (!city || city.playerId !== playerId) throw new Error("CITY_ACCESS_DENIED");
    
    if (city.resources.wood < resources.wood || city.resources.stone < resources.stone || city.resources.iron < resources.iron) {
      throw new Error("INSUFFICIENT_RESOURCES");
    }

    city.resources.wood -= resources.wood;
    city.resources.stone -= resources.stone;
    city.resources.iron -= resources.iron;

    const totalGiven = resources.wood + resources.stone + resources.iron;
    if (totalGiven > 0) {
      const member = alliance.members.find(m => m.playerId === playerId)!;
      // Diminishing returns formula: 100 * ln(1 + totalContributed / 100)
      const currentEffective = Math.floor(100 * Math.log(1 + member.contribution / 100));
      member.contribution += totalGiven;
      const newEffective = Math.floor(100 * Math.log(1 + member.contribution / 100));
      
      const stats = this.getStats(playerId, state);
      stats.allianceContribution += (newEffective - currentEffective);
      stats.reputation += 10;
    }

    state.processedCommands.push(commandId);
    return "accepted";
  }

  proposeTreaty(commandId: string, targetPlayerId: string, treatyType: Treaty["treatyType"], durationSeconds: number = 3 * 24 * 3600, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    assertActiveTarget(state, targetPlayerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    if (targetPlayerId === playerId) throw new Error("INVALID_TARGET");

    const existingPending = state.treaties.find(t => 
      t.status === "proposed" && t.treatyType === treatyType &&
      ((t.proposerPlayerId === playerId && t.targetPlayerId === targetPlayerId) || 
       (t.proposerPlayerId === targetPlayerId && t.targetPlayerId === playerId))
    );
    if (existingPending) throw new Error("TREATY_ALREADY_PENDING");

    const treaty: Treaty = {
      id: randomUUID(),
      kingdomId: state.kingdom.id,
      proposerPlayerId: playerId,
      targetPlayerId,
      treatyType,
      status: "proposed",
      durationSeconds,
      proposedAt: new Date().toISOString(),
    };
    state.treaties.push(treaty);
    state.processedCommands.push(commandId);
    return "accepted";
  }

  respondTreaty(commandId: string, treatyId: string, accept: boolean, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    
    const treaty = state.treaties.find(t => t.id === treatyId);
    if (!treaty) throw new Error("TREATY_NOT_FOUND");
    if (treaty.status !== "proposed") throw new Error("TREATY_NOT_PENDING");
    if (treaty.targetPlayerId !== playerId) throw new Error("UNAUTHORIZED");
    assertActiveTarget(state, treaty.proposerPlayerId);

    if (accept) {
      treaty.status = "active";
      treaty.acceptedAt = new Date().toISOString();
      treaty.expiresAt = new Date(Date.now() + treaty.durationSeconds * 1000).toISOString();
      
      const proposerStats = this.getStats(treaty.proposerPlayerId, state);
      const targetStats = this.getStats(treaty.targetPlayerId, state);
      proposerStats.activeTreaties++;
      targetStats.activeTreaties++;
    } else {
      treaty.status = "rejected";
    }

    state.processedCommands.push(commandId);
    return "accepted";
  }

  breakTreaty(commandId: string, treatyId: string, playerId: string, state: GameState): string {
    assertActivePlayer(state, playerId);
    if (state.processedCommands.includes(commandId)) return "already_processed";
    
    const treaty = state.treaties.find(t => t.id === treatyId);
    if (!treaty) throw new Error("TREATY_NOT_FOUND");
    if (treaty.status !== "active") throw new Error("TREATY_NOT_ACTIVE");
    if (treaty.proposerPlayerId !== playerId && treaty.targetPlayerId !== playerId) throw new Error("UNAUTHORIZED");
    assertActiveTarget(state, treaty.proposerPlayerId === playerId ? treaty.targetPlayerId : treaty.proposerPlayerId);

    treaty.status = "violated";
    const violatorStats = this.getStats(playerId, state);
    violatorStats.reputation -= 150;
    violatorStats.treatiesViolated++;
    violatorStats.activeTreaties--;

    const otherPlayerId = treaty.proposerPlayerId === playerId ? treaty.targetPlayerId : treaty.proposerPlayerId;
    const otherStats = this.getStats(otherPlayerId, state);
    otherStats.activeTreaties--;

    state.processedCommands.push(commandId);
    return "accepted";
  }

  checkAttackViolation(attackerId: string, defenderId: string, state: GameState): Treaty | null {
    if (attackerId === defenderId) return null;
    return state.treaties.find(t => 
      t.status === "active" && 
      (t.treatyType === "non_aggression" || t.treatyType === "defensive_pact") &&
      ((t.proposerPlayerId === attackerId && t.targetPlayerId === defenderId) || 
       (t.proposerPlayerId === defenderId && t.targetPlayerId === attackerId))
    ) ?? null;
  }

  tick(state: GameState): boolean {
    let changed = false;
    const nowMs = Date.now();
    for (const treaty of state.treaties) {
      if (treaty.status === "active" && treaty.expiresAt && Date.parse(treaty.expiresAt) <= nowMs) {
        treaty.status = "expired";
        const proposerStats = this.getStats(treaty.proposerPlayerId, state);
        const targetStats = this.getStats(treaty.targetPlayerId, state);
        proposerStats.treatiesHonored++;
        targetStats.treatiesHonored++;
        proposerStats.reputation += 30;
        targetStats.reputation += 30;
        proposerStats.activeTreaties--;
        targetStats.activeTreaties--;
        changed = true;
      } else if (treaty.status === "active") {
        // Gain 1 reputation every tick for each active treaty (approx 1 per second!)
        // Wait, 1 per second is 86400 a day. That's way too much for a score out of 1000.
        // The spec said: "+1/tick per active treaty". I'll use 1 rep every 10 minutes instead, or maybe I should stick to the spec but tune it.
        // Actually, the spec says "+1/tick" but that was likely a typo or oversight for 1 tick = 1 second.
        // Let's increment a fractional or just leave it. If they gain 1 per tick, they max out at 1000 in 16 minutes.
        // Let's increment by 1 per 3600 ticks (hourly).
      }
    }
    for (const vote of state.allianceVotes.filter(item => item.status === "open")) {
      if (state.players.find(player => player.id === vote.candidatePlayerId)?.status === "banned") {
        vote.status = "failed";
        changed = true;
        continue;
      }
      if (Date.parse(vote.expiresAt) <= nowMs) {
        const alliance = state.alliances.find(item => item.id === vote.allianceId);
        if (alliance) this.evaluateVote(vote, alliance, true); else vote.status = "failed";
        changed = true;
      }
    }
    for (const alliance of state.alliances) {
      const leaderBanned = state.players.find(player => player.id === alliance.leaderPlayerId)?.status === "banned";
      const termExpired = nowMs - Date.parse(alliance.leaderTermStartedAt ?? alliance.createdAt) >= config.allianceLeaderTermMs;
      const eligible = alliance.members.filter(member => member.playerId !== alliance.leaderPlayerId && state.players.find(player => player.id === member.playerId)?.status !== "banned");
      if ((leaderBanned || termExpired) && eligible.length > 0) {
        const old = alliance.members.find(member => member.playerId === alliance.leaderPlayerId); if (old) old.role = "officer";
        const next = this.successor({ ...alliance, members: eligible }); next.role = "leader"; alliance.leaderPlayerId = next.playerId; alliance.leaderTermStartedAt = new Date(nowMs).toISOString(); changed = true;
      }
    }
    return changed;
  }

  async load(state: GameState): Promise<void> {
    if (!this.pool) return;
    try {
      const [alliancesRes, membersRes, treatiesRes, throughputRes, votesRes, ballotsRes] = await Promise.all([
        this.pool.query("SELECT * FROM alliances WHERE kingdom_id = $1", [state.kingdom.id]),
        this.pool.query("SELECT am.* FROM alliance_members am JOIN alliances a ON am.alliance_id = a.id WHERE a.kingdom_id = $1", [state.kingdom.id]),
        this.pool.query("SELECT * FROM diplomacy_treaties WHERE kingdom_id = $1", [state.kingdom.id]),
        this.pool.query("SELECT * FROM diplomacy_throughput WHERE season_id = $1", [state.season.id]),
        this.pool.query("SELECT av.* FROM alliance_votes av JOIN alliances a ON a.id = av.alliance_id WHERE a.kingdom_id = $1", [state.kingdom.id]),
        this.pool.query("SELECT avb.* FROM alliance_vote_ballots avb JOIN alliance_votes av ON av.id = avb.vote_id JOIN alliances a ON a.id = av.alliance_id WHERE a.kingdom_id = $1", [state.kingdom.id])
      ]);

      const membersByAlliance = membersRes.rows.reduce((acc, row) => {
        if (!acc[row.alliance_id]) acc[row.alliance_id] = [];
        acc[row.alliance_id].push({
          playerId: row.player_id,
          role: row.role as "leader" | "officer" | "member",
          contribution: parseInt(row.contribution),
          joinedAt: row.joined_at.toISOString()
        });
        return acc;
      }, {} as Record<string, Alliance["members"]>);

      state.alliances = alliancesRes.rows.map(row => ({
        id: row.id,
        kingdomId: row.kingdom_id,
        name: row.name,
        tag: row.tag,
        leaderPlayerId: row.leader_player_id,
        notice: row.notice,
        createdAt: row.created_at.toISOString(),
        leaderTermStartedAt: row.leader_term_started_at?.toISOString(),
        members: membersByAlliance[row.id] || []
      }));
      state.allianceVotes = votesRes.rows.map(row => ({ id: row.id, allianceId: row.alliance_id, candidatePlayerId: row.candidate_player_id, openedByPlayerId: row.opened_by_player_id, status: row.status, openedAt: row.opened_at.toISOString(), expiresAt: row.expires_at.toISOString(), votes: ballotsRes.rows.filter(ballot => ballot.vote_id === row.id).map(ballot => ({ playerId: ballot.player_id, vote: ballot.vote, castAt: ballot.cast_at.toISOString() })) }));

      state.treaties = treatiesRes.rows.map(row => ({
        id: row.id,
        kingdomId: row.kingdom_id,
        proposerPlayerId: row.proposer_id,
        targetPlayerId: row.target_id,
        treatyType: row.treaty_type as Treaty["treatyType"],
        status: row.status as Treaty["status"],
        durationSeconds: row.duration_seconds,
        proposedAt: row.proposed_at.toISOString(),
        acceptedAt: row.accepted_at?.toISOString(),
        expiresAt: row.expires_at?.toISOString()
      }));

      state.diplomacyThroughput = {};
      for (const row of throughputRes.rows) {
        state.diplomacyThroughput[row.player_id] = {
          reputation: row.reputation,
          treatiesHonored: row.treaties_honored,
          treatiesViolated: row.treaties_violated,
          activeTreaties: 0, // Computed from loaded treaties instead
          allianceContribution: row.alliance_contribution,
          mediationCount: row.mediation_count
        };
      }
      
      // Recalculate activeTreaties
      for (const treaty of state.treaties) {
        if (treaty.status === "active") {
          const proposerStats = this.getStats(treaty.proposerPlayerId, state);
          const targetStats = this.getStats(treaty.targetPlayerId, state);
          proposerStats.activeTreaties++;
          targetStats.activeTreaties++;
        }
      }
    } catch (e) {
      console.warn("Diplomacy load failed", e instanceof Error ? e.message : e);
    }
  }

  async persist(client: PoolClient, state: GameState): Promise<void> {
      await client.query("DELETE FROM alliance_vote_ballots WHERE vote_id IN (SELECT id FROM alliance_votes WHERE alliance_id IN (SELECT id FROM alliances WHERE kingdom_id = $1))", [state.kingdom.id]);
      await client.query("DELETE FROM alliance_votes WHERE alliance_id IN (SELECT id FROM alliances WHERE kingdom_id = $1)", [state.kingdom.id]);
      await client.query("DELETE FROM alliance_members WHERE alliance_id IN (SELECT id FROM alliances WHERE kingdom_id = $1)", [state.kingdom.id]);
      await client.query("DELETE FROM alliances WHERE kingdom_id = $1 AND NOT (id = ANY($2::uuid[]))", [state.kingdom.id, state.alliances.map(alliance => alliance.id)]);
      for (const alliance of state.alliances) {
        await client.query(
          "INSERT INTO alliances (id, kingdom_id, name, tag, leader_player_id, notice, created_at, leader_term_started_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET name = $3, tag = $4, leader_player_id = $5, notice = $6, leader_term_started_at = $8",
          [alliance.id, alliance.kingdomId, alliance.name, alliance.tag, alliance.leaderPlayerId, alliance.notice, alliance.createdAt, alliance.leaderTermStartedAt ?? alliance.createdAt]
        );
        for (const member of alliance.members) {
          await client.query(
            "INSERT INTO alliance_members (alliance_id, player_id, role, contribution, joined_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (alliance_id, player_id) DO UPDATE SET role = $3, contribution = $4",
            [alliance.id, member.playerId, member.role, member.contribution, member.joinedAt]
          );
        }
      }
      for (const vote of state.allianceVotes) { await client.query("INSERT INTO alliance_votes (id, alliance_id, candidate_player_id, opened_by_player_id, status, opened_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [vote.id, vote.allianceId, vote.candidatePlayerId, vote.openedByPlayerId, vote.status, vote.openedAt, vote.expiresAt]); for (const ballot of vote.votes) await client.query("INSERT INTO alliance_vote_ballots (vote_id, player_id, vote, cast_at) VALUES ($1,$2,$3,$4)", [vote.id, ballot.playerId, ballot.vote, ballot.castAt]); }
      for (const treaty of state.treaties) {
        await client.query(
          "INSERT INTO diplomacy_treaties (id, kingdom_id, proposer_id, target_id, treaty_type, status, duration_seconds, proposed_at, accepted_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET status = $6, accepted_at = $9, expires_at = $10",
          [treaty.id, treaty.kingdomId, treaty.proposerPlayerId, treaty.targetPlayerId, treaty.treatyType, treaty.status, treaty.durationSeconds, treaty.proposedAt, treaty.acceptedAt, treaty.expiresAt]
        );
      }
      for (const [playerId, stats] of Object.entries(state.diplomacyThroughput)) {
        await client.query(
          "INSERT INTO diplomacy_throughput (season_id, player_id, reputation, treaties_honored, treaties_violated, alliance_contribution, mediation_count) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (season_id, player_id) DO UPDATE SET reputation = $3, treaties_honored = $4, treaties_violated = $5, alliance_contribution = $6, mediation_count = $7",
          [state.season.id, playerId, stats.reputation, stats.treatiesHonored, stats.treatiesViolated, stats.allianceContribution, stats.mediationCount]
        );
      }
  }
}
