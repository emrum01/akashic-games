// Keep encoder and upload failures on the caller's promise chain.
export async function saveJpg(canvas,name,save){
  const blob=await new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error(`JPEG encoding failed: ${name}`)),'image/jpeg',0.96);
  });
  await save(name,blob);
}
