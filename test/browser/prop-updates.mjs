function difference(a,b){let maximum=0;for(let i=0;i<a.length;i++)maximum=Math.max(maximum,Math.abs(a[i]-b[i]));return maximum;}

export async function backdropRemoval(truthy,equal,makeGlass,frameOf){
    const red=document.createElement("canvas");red.width=red.height=8;
    const context=red.getContext("2d");context.fillStyle="red";context.fillRect(0,0,8,8);
    const glass=makeGlass({},red),empty=makeGlass();
    try{
        empty.clearBackdrop();const expected=frameOf(empty),before=frameOf(glass);
        truthy(difference(before,expected)>0,"red backdrop is visible before removal");
        glass.setBackdrop(red,"stretch",true);frameOf(glass);
        glass.setBackdrop(null);
        equal(difference(frameOf(glass),expected),0,"null removes DOM backdrop pixels");
        context.fillStyle="lime";context.fillRect(0,0,8,8);
        equal(difference(frameOf(glass),expected),0,"removed live source no longer updates the frame");
        const image=new Image(),loaded=new Promise(resolve=>image.addEventListener("load",resolve,{once:true}));
        image.src=red.toDataURL();glass.setBackdrop(image);glass.setBackdrop(null);await loaded;
        equal(difference(frameOf(glass),expected),0,"removed pending image cannot restore the backdrop");
        const extension=glass.canvas.getContext("webgl2").getExtension("WEBGL_lose_context");truthy(extension,"context recovery supported");
        const lost=new Promise(resolve=>glass.canvas.addEventListener("webglcontextlost",resolve,{once:true}));extension.loseContext();await lost;
        await new Promise(resolve=>setTimeout(resolve,50));
        const restored=new Promise(resolve=>glass.canvas.addEventListener("webglcontextrestored",resolve,{once:true}));extension.restoreContext();await restored;
        equal(difference(frameOf(glass),expected),0,"removed source stays empty after context recovery");
    }finally{glass.destroy();empty.destroy();}
}

export function automaticRadius(truthy,equal,makeGlass,frameOf){
    const changed=makeGlass(),fresh=makeGlass();
    try{
        const frame={x:80,y:75,width:190,height:100,appearance:"light",adaptive:false};
        const shape=changed.add({...frame,radius:12}),reference=fresh.add(frame);
        truthy(difference(frameOf(changed),frameOf(fresh))>0,"explicit radius differs from the default");
        shape.set({radius:null});equal(difference(frameOf(changed),frameOf(fresh)),0,"null restores automatic shape radius");
        shape.set({width:170,height:140});reference.set({width:170,height:140});
        equal(difference(frameOf(changed),frameOf(fresh)),0,"automatic radius follows later size changes");
        shape.set({radius:[8,16,24,32]});frameOf(changed);shape.set({radius:null});
        equal(difference(frameOf(changed),frameOf(fresh)),0,"reset clears per-corner shape radii");
        const group=changed.addGroup({preset:"clear",appearance:"light",adaptive:false}),expected=fresh.addGroup({preset:"clear",appearance:"light",adaptive:false});
        const member=group.add({x:300,y:80,width:180,height:110,radius:[8,16,24,32]}),other=expected.add({x:300,y:80,width:180,height:110});
        truthy(member&&other,"group members created");member.set({radius:null});
        equal(difference(frameOf(changed),frameOf(fresh)),0,"group member reset clears per-corner radii");
        member.set({width:160,height:150});other.set({width:160,height:150});
        equal(difference(frameOf(changed),frameOf(fresh)),0,"automatic member radius follows later size changes");
    }finally{changed.destroy();fresh.destroy();}
}
