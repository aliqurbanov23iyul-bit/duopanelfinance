import test from 'node:test';
import assert from 'node:assert/strict';
import {balance,minor,money,csvCell,safeLink,day} from '../src/core.js';
test('decimal input and integer ledger',()=>{
  assert.equal(minor('12.09'),1209);
  assert.throws(()=>minor('0.001'));
  assert.throws(()=>minor('0'));
  assert.equal(money(-1n),'−0,01 ₼');
});
test('split, odd cent and settlement',()=>{
  const expenses = [{shared:true,amount_minor:3001,owner_id:'a'},{shared:true,amount_minor:1000,owner_id:'b'}];
  assert.equal(balance(expenses,[],'a'),1000n);
  assert.equal(balance(expenses,[],'b'),-1000n);
  assert.equal(balance(expenses,[{amount_minor:1000,owner_id:'b'}],'a'),0n);
});
test('csv injection, link scheme and Baku date',()=>{
  assert.equal(csvCell('=1+1'),"\"'=1+1\"");
  assert.equal(safeLink('javascript:alert(1)'),'');
  assert.equal(day(new Date('2026-11-09T22:00:00Z')),'2026-11-10');
});