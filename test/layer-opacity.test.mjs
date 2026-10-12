import test from 'node:test';
import assert from 'node:assert/strict';
import {layerOpacity} from '../dist/precision.js';

test('layer opacity rounds to an 8-bit vertex weight in binary16, including Float32 FMA boundaries',()=>{
    const controls=[
        [1,1],[.35,.34912109375],[.25,.2509765625],[.5,.501953125],
        [.7499499917030334,.7490234375],[.9998000264167786,1],
        [.25294119119644165,.2548828125],[.5039215683937073,.505859375]
    ];
    for(const [input,expected]of controls)assert.equal(layerOpacity(input),expected,'vertex weight for '+input);
});
