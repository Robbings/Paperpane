import test from 'node:test';
import assert from 'node:assert/strict';
import { sourcePdfUrl, paperSource, unwrapScholarLink } from '../src/browser-entry/source-urls.ts';

test('常见开放平台详情页解析到对应 PDF',()=>{
  const pairs=[
    ['https://openreview.net/forum?id=abc-123&referrer=homepage','https://openreview.net/pdf?id=abc-123'],
    ['https://aclanthology.org/2024.acl-long.1/','https://aclanthology.org/2024.acl-long.1.pdf'],
    ['https://aclanthology.org/P19-1001/','https://aclanthology.org/P19-1001.pdf'],
    ['https://proceedings.mlr.press/v139/radford21a.html','https://proceedings.mlr.press/v139/radford21a/radford21a.pdf'],
    ['https://openaccess.thecvf.com/content/CVPR2024/html/Author_Title_CVPR_2024_paper.html','https://openaccess.thecvf.com/content/CVPR2024/papers/Author_Title_CVPR_2024_paper.pdf'],
    ['https://papers.nips.cc/paper_files/paper/2017/hash/3f5ee243547dee91fbd053c1c4a845aa-Abstract.html','https://papers.nips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf'],
    ['https://huggingface.co/papers/1706.03762','https://arxiv.org/pdf/1706.03762'],
    ['https://www.biorxiv.org/content/10.1101/2024.01.01.123456v2','https://www.biorxiv.org/content/10.1101/2024.01.01.123456v2.full.pdf'],
    ['https://www.medrxiv.org/content/10.1101/2024.01.01.123456v1.full','https://www.medrxiv.org/content/10.1101/2024.01.01.123456v1.full.pdf'],
    ['https://hal.science/hal-01234567v2','https://hal.science/hal-01234567v2/document'],
  ];
  for(const[input,expected]of pairs)assert.equal(sourcePdfUrl(input),expected,input);
});

test('不猜测未知网页、平台索引页或伪造域名的 PDF',()=>{
  for(const url of ['https://publisher.test/article/123','https://openreview.net/group?id=ICLR','https://aclanthology.org/venues/acl/','https://openreview.net.evil.test/forum?id=abc','https://user:pass@openreview.net/forum?id=abc','javascript:alert(1)'])assert.equal(sourcePdfUrl(url),undefined,url);
});

test('Scholar 常见地区域名与链接包装不二次解码签名参数',()=>{
  for(const host of ['scholar.google.com','scholar.google.com.hk','scholar.google.co.uk','scholar.google.de','scholar.google.co.jp'])assert.equal(paperSource('https://'+host+'/scholar?q=test')?.id,'google-scholar');
  assert.equal(paperSource('https://scholar.google.com.evil.test/scholar'),undefined);
  const pdf='https://repository.test/download?sig=a%2Fb&file=paper';
  assert.equal(unwrapScholarLink('https://scholar.google.com/scholar_url?url='+encodeURIComponent(pdf)),pdf);
  assert.equal(unwrapScholarLink('https://scholar.google.com/scholar_url?url='+encodeURIComponent('javascript:alert(1)')),undefined);
  assert.equal(sourcePdfUrl('https://hal.science/hal-01234567/document?token=a%2Fb'),'https://hal.science/hal-01234567/document?token=a%2Fb');
});

test('Science keeps reader routes and signed resources intact',()=>{
 assert.equal(sourcePdfUrl('https://www.science.org/doi/epdf/10.1126/science.aao0185?referrer=https%3A%2F%2Fwww.science.org%2Fdoi%2Fepdf%2F10.1126%2Fscience.aao0185 '),'https://www.science.org/doi/epdf/10.1126/science.aao0185?referrer=https%3A%2F%2Fwww.science.org%2Fdoi%2Fepdf%2F10.1126%2Fscience.aao0185');
 assert.equal(sourcePdfUrl('https://www.science.org/doi/full/10.1126/science.aao0185'),'https://www.science.org/doi/epdf/10.1126/science.aao0185');
 for(const url of ['https://www.science.org/doi/epdf/not-a-doi','https://science.org.evil.test/doi/epdf/10.1126/test'])assert.equal(sourcePdfUrl(url),undefined);
});
