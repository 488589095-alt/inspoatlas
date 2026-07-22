export default async function SharedBoard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token !== "demo-inspiration-board") return <main style={{padding:40,fontFamily:"system-ui"}}><h1>分享已失效</h1><p>该画布不存在或链接已撤销。</p></main>;
  return <main style={{minHeight:"100vh",padding:"56px",fontFamily:"system-ui",background:"linear-gradient(135deg,#eef3ff,#fbecf2,#edf8f1)",color:"#28242c"}}><p style={{letterSpacing:".14em",fontSize:11,textTransform:"uppercase"}}>InspoAtlas · 只读画布</p><h1 style={{fontSize:42,margin:"14px 0"}}>水润产品视觉</h1><p style={{maxWidth:620,lineHeight:1.8,color:"#6f6874"}}>这是一份只读灵感图谱。素材、AI 分析和设计资产之间的来源关系保持可见；访问者无法编辑或查看所有者信息。</p><section style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:18,marginTop:38}}>{["水润产品主视觉","Fresh Product Landing","AI 分析与设计令牌"].map((title,index)=><article key={title} style={{minHeight:230,padding:22,border:"1px solid rgba(255,255,255,.8)",borderRadius:24,background:"rgba(255,255,255,.66)",boxShadow:"0 18px 50px rgba(58,45,75,.1)"}}><small>0{index+1}</small><h2>{title}</h2><p style={{lineHeight:1.7,color:"#716a76"}}>清透质感、高饱和视觉焦点与克制操作层级。</p></article>)}</section></main>;
}

