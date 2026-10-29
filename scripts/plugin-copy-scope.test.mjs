import test from 'node:test';
import assert from 'node:assert/strict';
import {extensionCopy} from '../src/extension-copy.mjs';
import {messages} from '../src/zh-CN.mjs';
import {readFileSync} from 'node:fs';

test('plugin copy keeps limited UI acceptance separate from failures, host execution and missing SMART samples',()=>{
 const byId=Object.fromEntries(extensionCopy.map(c=>[c.key,c]));
 assert.equal(byId.context.reviewedVersion,'0.5.9');
 assert.match(byId.context.detail,/0\.5\.7.*actual route-revisit CPU-editor failure/u);
 assert.match(byId.context.detail,/0\.5\.8 was rejected/u);
 assert.match(byId.context.detail,/No resource change was saved/u);
 assert.match(byId.ssh.detail,/channel remained off/u);
 assert.match(byId.ssh.detail,/did not execute SSH connections, host commands, collection, approval, migration or cross-day schedules/u);
 assert.equal(byId.ssh.status,'Collection unverified');
 assert.match(byId.smart.detail,/metric panel body, real SMART health samples, collection, persistent history and cross-day execution remain pending/u);
 assert.match(byId.smart.detail,/unavailable data must not be presented as healthy/u);
 assert.equal(byId.smart.status,'Real samples pending');
 assert.match(byId.ipmi.detail,/read-only checks with Rivetin 0\.2\.2/u);
 assert.match(byId.ipmi.detail,/Real BMC access.*remain unverified/u);
 for(const key of ['ipmi','context','ssh','smart'])assert.ok(Object.hasOwn(messages,byId[key].detail),key+': reviewed Chinese scope required');
 const guide=readFileSync(new URL('../src/documentation.mjs',import.meta.url),'utf8');
 assert.match(guide,/historical v3 version 0\.1\.1 remains separate/u);
 assert.match(guide,/did not execute host connections, commands, collection, approval, migration or cross-day schedules/u);
 assert.doesNotMatch(guide,/Source 0\.1\.2 is a compatibility candidate/u);
});

test('builtin identity success does not turn collection or queued tool integration into accepted deployment',()=>{const ssh=extensionCopy.find(c=>c.key==='ssh'),topology=extensionCopy.find(c=>c.key==='topology'),policy=extensionCopy.find(c=>c.key==='converter');assert.equal(ssh.status,'Collection unverified');assert.match(ssh.detail,/one built-in host.identity review/u);assert.match(ssh.detail,/does not validate SMART consumer execution/u);assert.match(topology.detail,/no real deployment or installed-feature acceptance/u);assert.match(policy.detail,/not yet deployed or accepted/u);for(const c of [ssh,topology,policy])assert.ok(Object.hasOwn(messages,c.detail));});
