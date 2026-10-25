const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const images = require('../assets/image-loader.js');
const manifest = {'/assets/photo.jpg':{src:'/assets/optimized/photo-640.webp',thumbnail:'/assets/optimized/photo-320.webp',width:640,height:800,srcset:'/assets/optimized/photo-320.webp 320w, /assets/optimized/photo-640.webp 640w'}};
test('original and optimized same-origin URLs resolve to the same image without rewriting third-party uploads',()=>{
 for(const value of ['/assets/photo.jpg','/assets/photo.jpg?v=1','/assets/optimized/photo-320.webp','https://example.com/assets/photo.jpg']) assert.equal(images.find(value,manifest,'https://example.com').original,'/assets/photo.jpg');
 assert.equal(images.find('https://external.com/assets/photo.jpg',manifest,'https://example.com'),null);
 assert.equal(images.find('/assets/unknown.jpg',manifest,'https://example.com'),null);
});
test('responsive assignment reuses an unchanged source and prioritizes only visible hero photos',()=>{
 const root={location:{origin:'https://example.com'},innerHeight:800,FBT_IMAGE_ASSETS:manifest};
 const context=vm.createContext({window:root,URL});vm.runInContext(fs.readFileSync(require.resolve('../assets/image-loader.js'),'utf8'),context);
 let writes=0;const attrs={};const img={setAttribute(k,v){if(k==='src')writes++;attrs[k]=v;},getAttribute(k){return attrs[k]||null;},removeAttribute(k){delete attrs[k];}};
 root.FBTImages.assign(img,'/assets/photo.jpg',{host:{getBoundingClientRect:()=>({top:0,bottom:600})},hero:true});
 assert.equal(img.loading,'eager');assert.equal(img.fetchPriority,'high');assert.equal(attrs.srcset,manifest['/assets/photo.jpg'].srcset);
 root.FBTImages.assign(img,'/assets/photo.jpg',{host:{getBoundingClientRect:()=>({top:3000,bottom:3600})},hero:true});
 assert.equal(writes,1);assert.equal(img.loading,'lazy');assert.equal(img.fetchPriority,'auto');
 root.FBTImages.assign(img,'https://external.com/upload.jpg',{host:{getBoundingClientRect:()=>({top:0,bottom:600})}});
 assert.equal(attrs.src,'https://external.com/upload.jpg');assert.equal(attrs.srcset,undefined);
});
