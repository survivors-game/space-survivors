// @vitest-environment node
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

describe("migración 0010 · guerras de alianza", () => {
  it("crea guerras y participantes con estados e índices válidos", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE pilots(pilot_id TEXT PRIMARY KEY);");
    db.exec(
      readFileSync("migrations/0008_alliance_system.sql", "utf8").replace(
        "ALTER TABLE pilots ADD COLUMN vip_until INTEGER;",
        "",
      ),
    );
    db.exec(readFileSync("migrations/0010_alliance_wars.sql", "utf8"));
    db.exec("INSERT INTO pilots(pilot_id) VALUES ('p1'),('p2'),('p3');");
    db.exec(
      "INSERT INTO alliances(alliance_id,name,tag,leader_pilot_id,created_at) VALUES ('a1','A','AA','p1',1),('a2','B','BB','p2',1);",
    );
    db.prepare(
      "INSERT INTO alliance_wars(war_id,attacker_alliance_id,defender_alliance_id,status,created_at) VALUES (?,?,?,?,?)",
    ).run("w1", "a1", "a2", "DECLARED", 1);
    db.prepare(
      "INSERT INTO alliance_war_participants(war_id,pilot_id,alliance_id,ship_id) VALUES (?,?,?,?)",
    ).run("w1", "p1", "a1", "falcon");
    db.prepare("INSERT INTO alliance_war_members(war_id,pilot_id,alliance_id) VALUES (?,?,?)").run(
      "w1",
      "p1",
      "a1",
    );
    db.prepare("INSERT INTO alliance_war_locks(alliance_id,war_id) VALUES (?,?)").run("a1", "w1");
    expect(db.prepare("SELECT status FROM alliance_wars WHERE war_id='w1'").get()).toEqual({
      status: "DECLARED",
    });
    expect(
      db
        .prepare(
          "SELECT ship_id FROM alliance_war_participants WHERE war_id='w1' AND pilot_id='p1'",
        )
        .get(),
    ).toEqual({ ship_id: "falcon" });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM alliance_war_members WHERE war_id='w1'").get(),
    ).toEqual({ count: 1 });
    expect(() =>
      db.prepare("INSERT INTO alliance_war_locks(alliance_id,war_id) VALUES (?,?)").run("a1", "w2"),
    ).toThrow();
    expect(() =>
      db.prepare("UPDATE alliance_wars SET status='INVALID' WHERE war_id='w1'").run(),
    ).toThrow();
    db.close();
  });
});
