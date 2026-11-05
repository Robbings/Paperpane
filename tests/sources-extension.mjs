import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PAPERPANE_PLAYWRIGHT_MODULE?pathToFileURL(process.env.PAPERPANE_PLAYWRIGHT_MODULE).href:'playwright');
const out=resolve('backups/source-validation');await mkdir(out,{recursive:true});
const pdf=await readFile(process.env.PAPERPANE_TEST_PDF??resolve('backups/arxiv-validation/1706.03762.pdf'));
const extension=resolve(process.env.PAPERPANE_EXTENSION ?? '.output/chrome-mv3');
const context=await chromium.launchPersistentContext(resolve('browser-profiles/source-validation-'+Date.now()),{executablePath:process.env.PAPERPANE_CHROMIUM,headless:true,viewport:{width:1600,height:1000},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
const errors=[];context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
const row=(id,title,url,right='')=>`<div class="gs_r gs_or gs_scl" data-cid="${id}" id="${id}">${right?`<div class="gs_ggs gs_fl"><div class="gs_or_ggsm"><a href="${right}"><span class="gs_ctg2">[PDF]</span> repository.test</a></div></div>`:''}<div class="gs_ri"><h3 class="gs_rt"><a href="${url}">${title}</a></h3><div class="gs_fl"><a href="#cite">引用</a></div></div></div>`;
const scholarUrl='https://scholar.google.com/scholar?q=paperpane-test';
const direct='https://repository.test/download?sig=a%2Fb';
const wrapped='https://scholar.google.com/scholar_url?url='+encodeURIComponent(direct);
const html=`<html><head><title>Scholar test</title><style>body{font:14px Arial;margin:24px}.gs_r{min-height:100px;margin-bottom:20px;border-bottom:1px solid #ddd;max-width:1100px}.gs_ggs{float:right;width:230px}a{color:#1644bb}.gs_rt{font-size:19px}.gs_ri{max-width:750px}</style></head><body>${row('r1','Paper one','https://publisher.test/article/one',wrapped)}${row('r2','OpenReview paper','https://openreview.net/forum?id=paper-two')}${row('r3','HTML only','https://publisher.test/article/html')}<div id="r4" class="gs_r gs_scl" data-cid="r4"><div class="gs_ggs"><a href="https://publisher.test/full-text">[HTML] publisher.test</a></div><h3 class="gs_rt"><a href="https://publisher.test/article/four">HTML article</a></h3></div>${row('r5','ACL paper','https://aclanthology.org/2024.acl-long.1/')}${row('r6','Unavailable PDF','https://publisher.test/article/six','https://repository.test/login.pdf')}</body></html>`;
const fullHtml=html.replace('</body>',`<div id="r7" class="gs_r gs_scl"><h3 class="gs_rt"><span class="gs_ct1">[PDF]</span><a href="https://repository.test/heading?token=heading%2Fpdf">PDF title result</a></h3></div><div id="r8" class="gs_r gs_scl"><h3 class="gs_rt"><span class="gs_ct1">[CITATION]</span>Citation only</h3></div></body>`);
async function openedBy(page,selector,expected){await page.bringToFront();const created=context.waitForEvent('page',tab=>tab.url().startsWith('chrome-extension:')&&new URL(tab.url()).pathname==='/reader.html');await page.locator(selector).click();const reader=await created;await reader.waitForURL(url=>url.searchParams.has('documentId'),{timeout:30000});await reader.locator('.textLayer span').first().waitFor({timeout:30000});assert.equal(new URL(reader.url()).searchParams.get('originalPdf'),expected);await reader.close();}
try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const root=`chrome-extension://${new URL(worker.url()).host}`;await worker.evaluate(()=>chrome.storage.local.set({onboarding:{welcomed:true,guided:true}}));
  const settings=await context.newPage();await settings.goto(root+'/options.html');
  await context.route('https://repository.test/**',route=>route.fulfill(route.request().url().endsWith('/login.pdf')?{contentType:'text/html',body:'<html>Sign in required</html>'}:{contentType:'application/pdf',body:pdf}));
  await context.route('https://openreview.net/pdf?**',route=>route.fulfill({contentType:'application/pdf',body:pdf}));
  await context.route('https://aclanthology.org/*.pdf',route=>route.fulfill({contentType:'application/pdf',body:pdf}));
  await context.route(scholarUrl,route=>route.fulfill({contentType:'text/html',body:fullHtml}));
  const scholar=await context.newPage();await scholar.goto(scholarUrl);
  await scholar.locator('#r1 [data-paperpane-button]').waitFor();
  assert.equal(await scholar.locator('[data-paperpane-source="google-scholar"]').count(),5);
  assert.equal(await scholar.locator('#r3 [data-paperpane-button],#r4 [data-paperpane-button],#r8 [data-paperpane-button]').count(),0);
  await scholar.screenshot({path:resolve(out,'google-scholar.png')});
  await openedBy(scholar,'#r1 [data-paperpane-button]',direct);
  await openedBy(scholar,'#r2 [data-paperpane-button]','https://openreview.net/pdf?id=paper-two');
  await openedBy(scholar,'#r5 [data-paperpane-button]','https://aclanthology.org/2024.acl-long.1.pdf');
  await openedBy(scholar,'#r7 [data-paperpane-button]','https://repository.test/heading?token=heading%2Fpdf');
  console.log('PASS: Scholar per-result PDF, encoded link, known-paper fallback, HTML exclusions and reader import');
  const newer='https://repository.test/download?sig=c%2Fd';
  await scholar.locator('#r1 .gs_ggs a').evaluate((el,url)=>{el.href=url;},newer);
  await scholar.waitForTimeout(250);await openedBy(scholar,'#r1 [data-paperpane-button]',newer);
  await scholar.evaluate(rowHtml=>document.body.insertAdjacentHTML('beforeend',rowHtml),row('dynamic','Added later','https://publisher.test/new','https://repository.test/late.pdf'));
  await scholar.locator('#dynamic [data-paperpane-button]').waitFor();
  await scholar.locator('#dynamic .gs_ggs').evaluate(el=>{el.innerHTML='<a href="https://repository.test/replaced.pdf">[PDF] replaced</a>';});
  await scholar.locator('#dynamic [data-paperpane-button]').waitFor();await openedBy(scholar,'#dynamic [data-paperpane-button]','https://repository.test/replaced.pdf');
  const show=async value=>{const result=await settings.evaluate(showPdfButtons=>chrome.runtime.sendMessage({type:'SET_BROWSER_ENTRY',patch:{showPdfButtons}}),value);assert(result.ok);};await show(false);
  await scholar.locator('[data-paperpane-button]').first().waitFor({state:'detached'});await show(true);await scholar.locator('#r1 [data-paperpane-button]').waitFor();
  console.log('PASS: Scholar reused links, delayed results, replaced download DOM and global hide/show');
  const failedCreated=context.waitForEvent('page');await scholar.locator('#r6 [data-paperpane-button]').click();const failed=await failedCreated;await failed.getByText('Sign in required',{exact:true}).waitFor();assert.equal(scholar.isClosed(),false);await failed.close();
  const hk='https://scholar.google.com.hk/scholar?q=paperpane-test';await context.route(hk,route=>route.fulfill({contentType:'text/html',body:fullHtml}));const regional=await context.newPage();await regional.goto(hk);await regional.locator('#r1 [data-paperpane-button]').waitFor();
  console.log('PASS: Scholar regional host and non-PDF download failure');
  const signedAcl='https://aclanthology.org/2024.acl-long.2/',signedAclPdf='https://aclanthology.org/2024.acl-long.2.pdf?token=a%2Fb';
  await context.route(signedAcl,route=>route.fulfill({contentType:'text/html',body:`<html><body><h1>Signed ACL</h1><a href="${signedAclPdf}">PDF</a></body></html>`}));
  await context.route(signedAclPdf,route=>route.fulfill({contentType:'application/pdf',body:pdf}));
  const signedAclPage=await context.newPage();await signedAclPage.goto(signedAcl);await signedAclPage.locator('[data-paperpane-button]').first().waitFor();
  assert.equal(await signedAclPage.locator('[data-paperpane-button]').count(),1,'signed .pdf download must not gain an unsigned duplicate');
  await openedBy(signedAclPage,'[data-paperpane-source="acl"] button',signedAclPdf);await signedAclPage.close();

  const platforms=[
    ['acl','https://aclanthology.org/2024.acl-long.1/','https://aclanthology.org/2024.acl-long.1.pdf'],
    ['openreview','https://openreview.net/forum?id=fixture','https://openreview.net/pdf?id=fixture'],
    ['cvf','https://openaccess.thecvf.com/content/CVPR2024/html/Author_Title_CVPR_2024_paper.html','https://openaccess.thecvf.com/content/CVPR2024/papers/Author_Title_CVPR_2024_paper.pdf'],
    ['pmlr','https://proceedings.mlr.press/v139/radford21a.html','https://proceedings.mlr.press/v139/radford21a/radford21a.pdf'],
    ['neurips','https://papers.nips.cc/paper_files/paper/2017/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html','https://papers.nips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf'],
    ['huggingface','https://huggingface.co/papers/1706.03762','https://arxiv.org/pdf/1706.03762'],
    ['biorxiv','https://www.biorxiv.org/content/10.1101/2024.01.01.123456v2','https://www.biorxiv.org/content/10.1101/2024.01.01.123456v2.full.pdf'],
    ['medrxiv','https://www.medrxiv.org/content/10.1101/2024.01.01.123456v1','https://www.medrxiv.org/content/10.1101/2024.01.01.123456v1.full.pdf'],
    ['hal','https://hal.science/hal-01234567','https://hal.science/hal-01234567/document'],
    ['semantic-scholar','https://www.semanticscholar.org/paper/fixture','https://repository.test/semantic.pdf'],
    ['pmc','https://pmc.ncbi.nlm.nih.gov/articles/PMC123456/','https://pmc.ncbi.nlm.nih.gov/articles/PMC123456/pdf/paper.pdf'],
    ['zenodo','https://zenodo.org/records/123456','https://zenodo.org/records/123456/files/paper.pdf'],
    ['frontiers','https://www.frontiersin.org/journals/test/articles/10.3389/ftest.2024.123/full','https://www.frontiersin.org/journals/test/articles/10.3389/ftest.2024.123/pdf'],
    ['plos','https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0123456','https://journals.plos.org/plosone/article/file?id=10.1371%2Fjournal.pone.0123456&type=printable'],
  ];
  for(const[id,url,target]of platforms){
    await context.route(url,route=>route.fulfill({contentType:'text/html',body:`<html><head><meta name="citation_pdf_url" content="${target.replaceAll('&','&amp;')}"></head><body><h1>Fixture ${id}</h1><a ${id==='semantic-scholar'?'data-test-id="paper-pdf-link"':''} href="${target.replaceAll('&','&amp;')}">Download PDF</a></body></html>`}));
    const page=await context.newPage();await page.goto(url);await page.locator(`[data-paperpane-source="${id}"] button`).waitFor();
    assert.equal(await page.locator('[data-paperpane-button]').count(),1,'one primary button for '+id);
    await context.route(target,route=>route.fulfill({contentType:'application/pdf',body:pdf}));
    await openedBy(page,`[data-paperpane-source="${id}"] button`,target);
    await page.locator('meta[name="citation_pdf_url"]').evaluate(el=>el.content='');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-paperpane-button]').count(),1,'empty metadata must fall back to actual PDF for '+id);
    assert.equal(await page.locator(`[data-paperpane-source="${id}"] button`).count(),1,'primary selector must work without metadata for '+id);
    await page.locator('meta[name="citation_pdf_url"]').evaluate(el=>el.remove());
    await page.locator('a').evaluateAll(links=>links.forEach(el=>el.remove()));
    if(!['semantic-scholar','pmc','zenodo'].includes(id)){
      await page.locator(`[data-paperpane-source="${id}"] button`).waitFor();
      await openedBy(page,`[data-paperpane-source="${id}"] button`,target);
    }else await page.locator('[data-paperpane-button]').waitFor({state:'detached'});
    await page.close();
  }
  console.log('PASS: 14 platform fixtures cover metadata, empty metadata, primary links and known-route fallback');
  const signedHal='https://hal.science/hal-02345678',signedTarget=signedHal+'/document?token=a%2Fb';
  await context.route(signedHal,route=>route.fulfill({contentType:'text/html',body:`<html><head><meta name="citation_pdf_url" content="#placeholder"></head><body><h1>Signed HAL</h1><a href="${signedTarget}">Full text</a></body></html>`}));
  await context.route(signedTarget,route=>route.fulfill({contentType:'application/pdf',body:pdf}));
  const signed=await context.newPage();await signed.goto(signedHal);await signed.locator('[data-paperpane-source="hal"] button').waitFor();await openedBy(signed,'[data-paperpane-source="hal"] button',signedTarget);await signed.close();
  const invalidMeta='https://www.semanticscholar.org/paper/invalid-meta',validDownload='https://repository.test/download?token=valid';
  await context.route(invalidMeta,route=>route.fulfill({contentType:'text/html',body:`<html><head><meta name="citation_pdf_url" content="javascript:alert(1)"></head><body><h1>Actual primary link</h1><a data-test-id="paper-pdf-link" href="${validDownload}">Full text</a></body></html>`}));
  const invalid=await context.newPage();await invalid.goto(invalidMeta);await invalid.locator('[data-paperpane-source="semantic-scholar"] button').waitFor();await openedBy(invalid,'[data-paperpane-source="semantic-scholar"] button',validDownload);await invalid.close();
  console.log('PASS: fragment/invalid metadata falls back; primary signed download keeps its token');
  assert.deepEqual(errors,[]);
  if(process.env.PAPERPANE_LIVE_SOURCES==='1'){
    await context.unrouteAll({behavior:'wait'});
    for(const[url,id]of [['https://aclanthology.org/2024.acl-long.1/','acl'],['https://proceedings.mlr.press/v139/radford21a.html','pmlr'],['https://papers.nips.cc/paper_files/paper/2017/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html','neurips']]){
      const page=await context.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.locator(`[data-paperpane-source="${id}"] button`).waitFor({timeout:10000});await page.screenshot({path:resolve(out,`live-${id}.png`)});await page.close();console.log('PASS: real '+id+' page button');
    }
    const live=await context.newPage();await live.goto('https://scholar.google.com/scholar?hl=en&q=Attention+Is+All+You+Need',{waitUntil:'domcontentloaded',timeout:45000});
    const count=await live.locator('[data-paperpane-source="google-scholar"]').count();await live.screenshot({path:resolve(out,'live-google-scholar.png')});
    console.log(count>0?`PASS: real Google Scholar page injected ${count} result buttons`:'UNVERIFIED: live Scholar did not expose usable results (access restriction or no PDF); fixture coverage passed');
  }
}catch(error){for(const page of context.pages())console.log('PAGE',page.url(),(await page.locator('body').innerText().catch(()=>'' )).slice(0,600),await page.locator('[data-paperpane-button]').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,title:n.title}))).catch(()=>[]));throw error;}finally{await context.close();}
