import { describe, expect, it } from "vitest";
import { allianceLevelForWins, canDeclareAgainstLevel, canStartWar, hasExpired, hasMinimumMembers, isLossCooldownActive, resolveWarWinner, warReward } from "@/game/alliance-war-rules";

describe("Fase D · reglas de guerras",()=>{
 it("calcula el nivel de alianza según victorias acumuladas",()=>{
  expect([0,4,5,14,15,29,30,49,50].map(allianceLevelForWins)).toEqual([1,1,2,2,3,3,4,4,5]);
 });
 it("valida nivel rival y mínimo de miembros",()=>{
  expect(canDeclareAgainstLevel(2,2)).toBe(true);expect(canDeclareAgainstLevel(2,3)).toBe(true);
  expect(canDeclareAgainstLevel(2,1)).toBe(false);expect(canDeclareAgainstLevel(2,4)).toBe(false);
  expect(hasMinimumMembers(3,3)).toBe(true);expect(hasMinimumMembers(2,3)).toBe(false);
 });
 it("exige al menos tres naves seleccionadas por alianza",()=>{
  expect(canStartWar(3,3)).toBe(true);expect(canStartWar(2,3)).toBe(false);expect(canStartWar(3,2)).toBe(false);
 });
 it("activa las 12 horas solo después de una derrota reciente",()=>{
  const now=1000000;
  expect(isLossCooldownActive("other","mine",now-1000,now)).toBe(true);
  expect(isLossCooldownActive("mine","mine",now-1000,now)).toBe(false);
  expect(isLossCooldownActive(null,"mine",now-1000,now)).toBe(false);
  expect(isLossCooldownActive("other","mine",now-13*60*60*1000,now)).toBe(false);
 });
 it("expira declaraciones y preparación al vencer su plazo",()=>{
  expect(hasExpired(100,0,100)).toBe(true);expect(hasExpired(99,0,100)).toBe(false);
 });
 it("calcula exactamente las recompensas por resultado",()=>{
  expect(warReward("WIN")).toEqual({obsidian:5,credits:200});
  expect(warReward("LOSS")).toEqual({obsidian:0,credits:50});
  expect(warReward("DRAW")).toEqual({obsidian:0,credits:100});
 });
 it("decide por eliminación, hordas y naves supervivientes",()=>{
  expect(resolveWarWinner(1,0,0,2)).toBe("defender");expect(resolveWarWinner(4,3,2,1)).toBe("attacker");
  expect(resolveWarWinner(2,5,3,1)).toBe("defender");expect(resolveWarWinner(10,10,4,3)).toBe("attacker");
  expect(resolveWarWinner(10,10,3,3)).toBe("draw");
 });
});
