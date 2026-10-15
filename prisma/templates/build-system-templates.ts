// Generator (regeneration source) for the system template .docx files.
// Run with `tsx prisma/templates/build-system-templates.ts` to (re)write the
// .docx files under prisma/templates/system/ and the manifest. The seed then
// reads those files — the .docx are the canonical artifact committed to git.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

function createDocx(content: string): Buffer {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`)

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)

  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal">
<w:name w:val="Normal"/>
<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr>
</w:style>
</w:styles>`)

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${content}</w:body>
</w:document>`)

  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function p(text: string, opts: { bold?: boolean; size?: number; align?: string; spacing?: number } = {}): string {
  const align = opts.align ? ` w:jc="${opts.align}"` : ''
  const spacing = opts.spacing ? `<w:spacing w:before="${opts.spacing}" w:after="120"/>` : '<w:spacing w:after="120"/>'
  return `<w:p>${opts.align ? `<w:pPr>${spacing}<w:jc w:val="${opts.align}"/></w:pPr>` : `<w:pPr>${spacing}</w:pPr>`}<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${opts.bold ? '<w:b/>' : ''}${opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : '<w:sz w:val="22"/><w:szCs w:val="22"/>'}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function kv(label: string, value: string): string {
  return `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${label} </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${value}</w:t></w:r></w:p>`
}

function blank(after = 200): string {
  return `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr></w:p>`
}

function signature(): string {
  return [
    blank(400),
    p('{todayLong}.', { align: 'right' }),
    blank(600),
    p('________________________________', { align: 'center' }),
    p('{lawyerName}', { align: 'center' }),
    p('{lawyerOab}', { align: 'center' }),
    p('{lawyerMail}', { align: 'center' }),
  ].join('')
}

function header(title: string): string {
  return [
    p('{lawyerOfficeName}', { bold: true, size: 26, align: 'right' }),
    p('{lawyerOab} | {lawyerPhone} | {lawyerMail}', { size: 18, align: 'right' }),
    blank(200),
    p(title, { bold: true, size: 32, align: 'center', spacing: 300 }),
    blank(200),
  ].join('')
}

const parecerContent = [
  p('PARECER TÉCNICO-JURÍDICO DE APURAÇÃO TRABALHISTA', { bold: true, size: 32, align: 'center', spacing: 300 }),
  blank(200),
  p('I – DAS PARTES', { bold: true, size: 26, spacing: 300 }),
  kv('Reclamante:', '{clientName}'),
  kv('Documento:', '{clientDocument}'),
  kv('Data:', '{today}'),
  kv('Versão do cálculo:', '{calculationVersion}'),
  blank(200),
  p('II – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  kv('Aviso prévio:', '{priorNoticeWorked}'),
  kv('Data do aviso prévio:', '{priorNoticeDate}'),
  blank(200),
  p('III – DA REMUNERAÇÃO', { bold: true, size: 26, spacing: 300 }),
  kv('Salário base:', '{baseSalary}'),
  kv('Último salário:', '{lastSalary}'),
  kv('Média últimos 3 salários:', '{lastThreeSalariesAvg}'),
  kv('Horas extras mensais:', '{extraHours}'),
  kv('Horas noturnas mensais:', '{nightHours}'),
  kv('Grau de insalubridade:', '{insalubrityLevel}'),
  kv('Periculosidade:', '{dangerousWork}'),
  blank(200),
  p('IV – DA APURAÇÃO DAS VERBAS', { bold: true, size: 26, spacing: 300 }),
  kv('Aviso Prévio:', '{priorNoticeValue}'),
  kv('13º Salário:', '{thirteenthSalaryValue}'),
  kv('Férias + 1/3:', '{vacationValue}'),
  kv('Dobra de Férias:', '{doubleVacationValue}'),
  kv('FGTS (8%):', '{fgtsValue}'),
  kv('Multa FGTS (40%):', '{fgtsFineValue}'),
  kv('Seguro Desemprego:', '{unemploymentInsuranceValue}'),
  kv('Horas Extras:', '{extraHoursValue}'),
  kv('Adicional Noturno:', '{nightAdditionalValue}'),
  kv('Insalubridade:', '{insalubrityValue}'),
  kv('Periculosidade (30%):', '{dangerousWorkValue}'),
  kv('Multa Art. 477 CLT:', '{art477FineValue}'),
  kv('Reflexo no 13º:', '{reflexo13thValue}'),
  kv('Reflexo nas Férias:', '{reflexoVacationValue}'),
  kv('Reflexo no FGTS:', '{reflexoFGTSValue}'),
  kv('Reflexo na Multa FGTS:', '{reflexoMultaFGTSValue}'),
  blank(200),
  p('V – DO VALOR TOTAL BRUTO ESTIMADO', { bold: true, size: 26, spacing: 300 }),
  p('{totalValue}', { bold: true, size: 36, align: 'center' }),
  blank(200),
  p('VI – DA LIQUIDAÇÃO (V3)', { bold: true, size: 26, spacing: 300 }),
  p('A seguir a composição da liquidação com deduções previdenciárias, fiscais e honorários advocatícios.'),
  kv('Bruto Devido Reclamante:', '{brutoDevidoReclamante}'),
  kv('(-) INSS Empregado:', '{inssEmployeeValue}'),
  kv('(-) IRPF:', '{irpfValue}'),
  kv('(-) Custas Judiciais:', '{custasJudiciaisValue}'),
  kv('= Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  kv('INSS Empregador (20%):', '{inssEmployerValue}'),
  kv('SAT/RAT:', '{satRatValue}'),
  kv('Honorários Advocatícios Líquidos:', '{honorariosLiquidosValue}'),
  kv('Total Devido Reclamado:', '{totalDevidoReclamado}'),
  blank(200),
  p('VII – DA ANÁLISE', { bold: true, size: 26, spacing: 300 }),
  kv('Correção monetária total:', '{correctionTotal}'),
  kv('Juros de mora total:', '{interestTotal}'),
  kv('% Remuneratório:', '{percentualRemuneratorio}'),
  blank(200),
  p('VIII – DAS OBSERVAÇÕES', { bold: true, size: 26, spacing: 300 }),
  p('{observations}'),
  blank(200),
  p('IX – DA CONCLUSÃO', { bold: true, size: 26, spacing: 300 }),
  p('Diante dos parâmetros analisados, estima-se o montante de {totalValue} a título de passivo trabalhista potencial, sujeito à validação documental e probatória em eventual demanda judicial.'),
  signature(),
].join('')

const peticaoContent = [
  p('EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA VARA DO TRABALHO', { bold: true, size: 22, align: 'center', spacing: 300 }),
  blank(200),
  p('{lawyerName}, brasileiro, advogado, inscrito na OAB sob o nº {lawyerOab}, com escritório profissional na {lawyerOfficeName}, vem, respeitosamente, à presença de Vossa Excelência, com fulcro nos artigos 840, §1º, da CLT e 319 do CPC, propor', { align: 'justified' }),
  blank(100),
  p('RECLAMAÇÃO TRABALHISTA', { bold: true, size: 26, align: 'center' }),
  blank(200),
  p('I – DO RECLAMANTE', { bold: true, size: 26, spacing: 300 }),
  kv('Nome:', '{clientName}'),
  kv('Documento:', '{clientDocument}'),
  blank(200),
  p('II – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  kv('Aviso prévio:', '{priorNoticeWorked}'),
  blank(200),
  p('III – DOS PEDIDOS', { bold: true, size: 26, spacing: 300 }),
  kv('Saldo de Salário:', '{saldoSalarioValue}'),
  kv('13º Salário:', '{thirteenthSalaryValue}'),
  kv('Férias + 1/3:', '{vacationValue}'),
  kv('Dobra de Férias:', '{doubleVacationValue}'),
  kv('Aviso Prévio:', '{priorNoticeValue}'),
  kv('FGTS (8%):', '{fgtsValue}'),
  kv('Multa FGTS (40%):', '{fgtsFineValue}'),
  kv('Seguro Desemprego:', '{unemploymentInsuranceValue}'),
  kv('Horas Extras:', '{extraHoursValue}'),
  kv('Adicional Noturno:', '{nightAdditionalValue}'),
  kv('Insalubridade:', '{insalubrityValue}'),
  kv('Periculosidade (30%):', '{dangerousWorkValue}'),
  kv('Multa Art. 477 CLT:', '{art477FineValue}'),
  blank(200),
  p('IV – DO VALOR TOTAL', { bold: true, size: 26, spacing: 300 }),
  kv('Total Bruto:', '{totalValue}'),
  kv('Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  kv('Total Devido Reclamado:', '{totalDevidoReclamado}'),
  blank(200),
  p('Dá-se à causa o valor de {totalValue}.', { align: 'justified' }),
  blank(400),
  p('Termos em que,', { align: 'justified' }),
  p('Pede deferimento.', { align: 'justified' }),
  signature(),
].join('')

const acordoContent = [
  header('PROPOSTA DE ACORDO EXTRAJUDICIAL'),
  p('I – DAS PARTES', { bold: true, size: 26, spacing: 300 }),
  kv('PROPONENTE:', '{clientName} | Documento: {clientDocument}'),
  kv('CONTRAPARTE:', '[NOME DA EMPRESA] | CNPJ: [CNPJ]'),
  kv('ADVOGADO:', '{lawyerName} | {lawyerOab}'),
  blank(200),
  p('II – DO OBJETO', { bold: true, size: 26, spacing: 300 }),
  p('A presente proposta de acordo extrajudicial tem por objeto a quitação de verbas trabalhistas devidas ao reclamante durante o contrato de trabalho.', { align: 'justified' }),
  blank(200),
  p('III – DAS VERBAS DEVIDAS', { bold: true, size: 26, spacing: 300 }),
  kv('13º Salário:', '{thirteenthSalaryValue}'),
  kv('Férias + 1/3:', '{vacationValue}'),
  kv('FGTS (8%):', '{fgtsValue}'),
  kv('Multa FGTS (40%):', '{fgtsFineValue}'),
  kv('Aviso Prévio:', '{priorNoticeValue}'),
  kv('Horas Extras:', '{extraHoursValue}'),
  kv('Adicional Noturno:', '{nightAdditionalValue}'),
  kv('Insalubridade:', '{insalubrityValue}'),
  kv('Periculosidade:', '{dangerousWorkValue}'),
  blank(120),
  p('IV – DA LIQUIDAÇÃO (V3)', { bold: true, size: 26, spacing: 300 }),
  kv('Bruto Devido Reclamante:', '{brutoDevidoReclamante}'),
  kv('(-) INSS Empregado:', '{inssEmployeeValue}'),
  kv('(-) IRPF:', '{irpfValue}'),
  kv('= Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  blank(120),
  kv('TOTAL:', '{totalValue}'),
  blank(200),
  p('V – DAS CONDIÇÕES DE PAGAMENTO', { bold: true, size: 26, spacing: 300 }),
  p('O pagamento será efetuado em parcela única, no prazo de [XX] dias úteis contados da assinatura deste instrumento, mediante depósito bancário na conta indicada pelo reclamante.', { align: 'justified' }),
  blank(200),
  p('VI – DA QUITAÇÃO', { bold: true, size: 26, spacing: 300 }),
  p('Efetuado o pagamento conforme acordado, o reclamante dá plena e geral quitação de todos os direitos decorrentes do contrato de trabalho.', { align: 'justified' }),
  blank(200),
  p('VII – DA VALIDADE', { bold: true, size: 26, spacing: 300 }),
  p('A presente proposta tem validade de 15 (quinze) dias úteis a contar desta data.', { align: 'justified' }),
  blank(200),
  p('VIII – DO FORO', { bold: true, size: 26, spacing: 300 }),
  p('Fica eleito o foro da Comarca de [CIDADE/UF] para dirimir quaisquer dúvidas oriundas deste instrumento.', { align: 'justified' }),
  blank(200),
  p('NESSES TERMOS,', { bold: true, size: 22 }),
  p('Aguarda-se manifestação dentro do prazo estabelecido.', { align: 'justified' }),
  signature(),
].join('')

const notificacaoContent = [
  header('NOTIFICAÇÃO EXTRAJUDICIAL'),
  blank(100),
  kv('A(O) SENHOR(A) REPRESENTANTE LEGAL DE', '[NOME DA EMPRESA]'),
  kv('CNPJ:', '[CNPJ]'),
  kv('ENDEREÇO:', '[ENDEREÇO COMPLETO DA EMPRESA]'),
  blank(200),
  p('{lawyerName}, brasileiro, advogado, inscrito na OAB sob o nº {lawyerOab}, com escritório profissional na {lawyerOfficeName}, na qualidade de patrono do(a) Sr(a). {clientName}, portador(a) do documento nº {clientDocument}, vem, respeitosamente, NOTIFICAR a empresa acima qualificada para, no prazo de 15 (quinze) dias úteis, proceder ao pagamento das verbas rescisórias abaixo discriminadas, sob pena de ajuizamento de ação trabalhista.', { align: 'justified' }),
  blank(200),
  p('I – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  blank(200),
  p('II – DAS VERBAS DEVIDAS', { bold: true, size: 26, spacing: 300 }),
  kv('13º Salário:', '{thirteenthSalaryValue}'),
  kv('Férias + 1/3:', '{vacationValue}'),
  kv('Dobra de Férias:', '{doubleVacationValue}'),
  kv('FGTS (8%):', '{fgtsValue}'),
  kv('Multa FGTS (40%):', '{fgtsFineValue}'),
  kv('Aviso Prévio:', '{priorNoticeValue}'),
  kv('Horas Extras:', '{extraHoursValue}'),
  kv('Adicional Noturno:', '{nightAdditionalValue}'),
  kv('Insalubridade:', '{insalubrityValue}'),
  kv('Periculosidade:', '{dangerousWorkValue}'),
  kv('Multa Art. 477 CLT:', '{art477FineValue}'),
  blank(120),
  p('III – DA LIQUIDAÇÃO (V3)', { bold: true, size: 26, spacing: 300 }),
  kv('Bruto Devido Reclamante:', '{brutoDevidoReclamante}'),
  kv('(-) INSS Empregado:', '{inssEmployeeValue}'),
  kv('(-) IRPF:', '{irpfValue}'),
  kv('= Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  blank(200),
  kv('TOTAL APURADO:', '{totalValue}'),
  blank(200),
  p('Caso não haja manifestação no prazo estipulado, será providenciado o ajuizamento da reclamação trabalhista competente, acrescendo-se ao valor pleiteado as verbas de natureza acessória, como honorários advocatícios, correção monetária e juros de mora.', { align: 'justified' }),
  blank(200),
  p('IV – DA QUITAÇÃO', { bold: true, size: 26, spacing: 300 }),
  p('O pagamento das verbas acima elencadas importará em quitação plena e geral de todos os direitos decorrentes do contrato de trabalho mantido entre as partes.', { align: 'justified' }),
  blank(200),
  p('V – DO ADVOGADO RESPONSÁVEL', { bold: true, size: 26, spacing: 300 }),
  kv('Nome:', '{lawyerName}'),
  kv('OAB:', '{lawyerOab}'),
  kv('Telefone:', '{lawyerPhone}'),
  kv('E-mail:', '{lawyerMail}'),
  signature(),
].join('')

const danosMoraisContent = [
  p('EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA VARA DO TRABALHO', { bold: true, size: 22, align: 'center', spacing: 300 }),
  blank(200),
  p('{lawyerName}, brasileiro, advogado, inscrito na OAB sob o nº {lawyerOab}, com escritório profissional na {lawyerOfficeName}, vem, respeitosamente, à presença de Vossa Excelência, com fulcro nos artigos 840, §1º, da CLT, 319 do CPC e 5º, V e X, da Constituição Federal, propor', { align: 'justified' }),
  blank(100),
  p('RECLAMAÇÃO TRABALHISTA COM PEDIDO DE INDENIZAÇÃO POR DANOS MORAIS', { bold: true, size: 26, align: 'center' }),
  blank(200),
  p('I – DO RECLAMANTE', { bold: true, size: 26, spacing: 300 }),
  kv('Nome:', '{clientName}'),
  kv('Documento:', '{clientDocument}'),
  blank(200),
  p('II – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  blank(200),
  p('III – DOS FATOS', { bold: true, size: 26, spacing: 300 }),
  p('O reclamante foi contratado pela reclamada para exercer suas atividades laborativas, tendo sofrido, no curso do contrato de trabalho, condutas que lhe causaram abalo moral, configurando dano moral trabalhista, nos termos do art. 223-B da CLT.', { align: 'justified' }),
  blank(200),
  p('IV – DOS PEDIDOS TRABALHISTAS', { bold: true, size: 26, spacing: 300 }),
  kv('Aviso Prévio:', '{priorNoticeValue}'),
  kv('13º Salário:', '{thirteenthSalaryValue}'),
  kv('Férias + 1/3:', '{vacationValue}'),
  kv('FGTS (8%):', '{fgtsValue}'),
  kv('Multa FGTS (40%):', '{fgtsFineValue}'),
  kv('Horas Extras:', '{extraHoursValue}'),
  kv('Adicional Noturno:', '{nightAdditionalValue}'),
  kv('Insalubridade:', '{insalubrityValue}'),
  kv('Periculosidade:', '{dangerousWorkValue}'),
  blank(200),
  p('V – DO PEDIDO DE DANOS MORAIS', { bold: true, size: 26, spacing: 300 }),
  p('Requer a condenação da reclamada ao pagamento de indenização por danos morais, em valor não inferior a [ESPECIFICAR VALOR], em razão dos constrangimentos sofridos pelo reclamante no curso do contrato de trabalho.', { align: 'justified' }),
  blank(200),
  p('VI – DO VALOR TOTAL', { bold: true, size: 26, spacing: 300 }),
  kv('Total Bruto Verbas Trabalhistas:', '{totalValue}'),
  kv('Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  blank(200),
  p('Dá-se à causa o valor de {totalValue}, acrescido do pedido de danos morais.', { align: 'justified' }),
  blank(400),
  p('Termos em que,', { align: 'justified' }),
  p('Pede deferimento.', { align: 'justified' }),
  signature(),
].join('')

const avisoPrevioContent = [
  header('CÁLCULO DE AVISO PRÉVIO INDENIZADO'),
  p('I – DO RECLAMANTE', { bold: true, size: 26, spacing: 300 }),
  kv('Nome:', '{clientName}'),
  kv('Documento:', '{clientDocument}'),
  kv('Data do cálculo:', '{today}'),
  kv('Versão do cálculo:', '{calculationVersion}'),
  blank(200),
  p('II – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  kv('Aviso prévio trabalhado:', '{priorNoticeWorked}'),
  kv('Data do aviso:', '{priorNoticeDate}'),
  blank(200),
  p('III – DA REMUNERAÇÃO BASE', { bold: true, size: 26, spacing: 300 }),
  kv('Salário base:', '{baseSalary}'),
  kv('Último salário:', '{lastSalary}'),
  kv('Média últimos 3 salários:', '{lastThreeSalariesAvg}'),
  blank(200),
  p('IV – DO CÁLCULO DO AVISO PRÉVIO INDENIZADO', { bold: true, size: 26, spacing: 300 }),
  p('Conforme art. 7º, XXI, da CF e Lei 12.506/2011, o aviso prévio indenizado é proporcional ao tempo de serviço, acrescido de 3 dias por cada ano completo de serviço, até o máximo de 90 dias.', { align: 'justified' }),
  blank(100),
  kv('Valor do Aviso Prévio:', '{priorNoticeValue}'),
  kv('Reflexo no 13º:', '{reflexo13thValue}'),
  kv('Reflexo nas Férias:', '{reflexoVacationValue}'),
  kv('Reflexo no FGTS:', '{reflexoFGTSValue}'),
  kv('Reflexo na Multa FGTS:', '{reflexoMultaFGTSValue}'),
  blank(200),
  p('V – DO TOTAL APURADO', { bold: true, size: 26, spacing: 300 }),
  p('{totalValue}', { bold: true, size: 36, align: 'center' }),
  blank(200),
  p('VI – DAS OBSERVAÇÕES', { bold: true, size: 26, spacing: 300 }),
  p('{observations}'),
  signature(),
].join('')

const horasExtrasContent = [
  header('RECLAMAÇÃO DE HORAS EXTRAS E ADICIONAIS'),
  p('I – DO RECLAMANTE', { bold: true, size: 26, spacing: 300 }),
  kv('Nome:', '{clientName}'),
  kv('Documento:', '{clientDocument}'),
  blank(200),
  p('II – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  blank(200),
  p('III – DA REMUNERAÇÃO', { bold: true, size: 26, spacing: 300 }),
  kv('Salário base:', '{baseSalary}'),
  kv('Último salário:', '{lastSalary}'),
  kv('Horas extras mensais:', '{extraHours}'),
  kv('Horas noturnas mensais:', '{nightHours}'),
  kv('Grau de insalubridade:', '{insalubrityLevel}'),
  kv('Periculosidade:', '{dangerousWork}'),
  blank(200),
  p('IV – DOS PEDIDOS', { bold: true, size: 26, spacing: 300 }),
  p('O reclamante pleiteia o pagamento das horas extras e adicionais não remunerados durante o contrato de trabalho, conforme detalhamento abaixo:', { align: 'justified' }),
  blank(100),
  kv('Horas Extras:', '{extraHoursValue}'),
  kv('Adicional Noturno:', '{nightAdditionalValue}'),
  kv('Insalubridade:', '{insalubrityValue}'),
  kv('Periculosidade (30%):', '{dangerousWorkValue}'),
  blank(120),
  p('V – DOS REFLEXOS', { bold: true, size: 26, spacing: 300 }),
  kv('Reflexo no 13º:', '{reflexo13thValue}'),
  kv('Reflexo nas Férias:', '{reflexoVacationValue}'),
  kv('Reflexo no FGTS:', '{reflexoFGTSValue}'),
  kv('Reflexo na Multa FGTS:', '{reflexoMultaFGTSValue}'),
  blank(200),
  p('VI – DO TOTAL', { bold: true, size: 26, spacing: 300 }),
  kv('Total Bruto:', '{totalValue}'),
  kv('Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  kv('Total Devido Reclamado:', '{totalDevidoReclamado}'),
  blank(200),
  p('Dá-se à causa o valor de {totalValue}.', { align: 'justified' }),
  blank(400),
  p('Termos em que,', { align: 'justified' }),
  p('Pede deferimento.', { align: 'justified' }),
  signature(),
].join('')

const fgtsMultaContent = [
  header('CÁLCULO DE FGTS E MULTA DE 40%'),
  p('I – DO RECLAMANTE', { bold: true, size: 26, spacing: 300 }),
  kv('Nome:', '{clientName}'),
  kv('Documento:', '{clientDocument}'),
  kv('Data do cálculo:', '{today}'),
  kv('Versão do cálculo:', '{calculationVersion}'),
  blank(200),
  p('II – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  blank(200),
  p('III – DA REMUNERAÇÃO BASE', { bold: true, size: 26, spacing: 300 }),
  kv('Salário base:', '{baseSalary}'),
  kv('Último salário:', '{lastSalary}'),
  kv('Média últimos 3 salários:', '{lastThreeSalariesAvg}'),
  blank(200),
  p('IV – DO CÁLCULO DO FGTS', { bold: true, size: 26, spacing: 300 }),
  p('Conforme art. 15 da Lei 8.036/1990, o empregador deve depositar mensalmente 8% da remuneração do trabalhador na conta vinculada do FGTS.', { align: 'justified' }),
  blank(100),
  kv('FGTS (8%):', '{fgtsValue}'),
  kv('Multa FGTS (40%):', '{fgtsFineValue}'),
  blank(200),
  p('V – DOS REFLEXOS', { bold: true, size: 26, spacing: 300 }),
  kv('Reflexo no FGTS (Aviso Prévio):', '{reflexoFGTSValue}'),
  kv('Reflexo na Multa FGTS:', '{reflexoMultaFGTSValue}'),
  blank(200),
  p('VI – DO TOTAL FGTS', { bold: true, size: 26, spacing: 300 }),
  kv('Total FGTS + Multa:', '{fgtsFineValue}'),
  blank(200),
  p('VII – DA LIQUIDAÇÃO (V3)', { bold: true, size: 26, spacing: 300 }),
  kv('Bruto Devido Reclamante:', '{brutoDevidoReclamante}'),
  kv('(-) INSS Empregado:', '{inssEmployeeValue}'),
  kv('= Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  blank(200),
  p('VIII – DO TOTAL APURADO', { bold: true, size: 26, spacing: 300 }),
  p('{totalValue}', { bold: true, size: 36, align: 'center' }),
  signature(),
].join('')

const recursoOrdinarioContent = [
  p('EXCELENTÍSSIMO SENHOR DOUTOR DESEMBARGADOR PRESIDENTE DO EGRÉGIO TRIBUNAL REGIONAL DO TRABALHO', { bold: true, size: 22, align: 'center', spacing: 300 }),
  blank(200),
  p('{lawyerName}, brasileiro, advogado, inscrito na OAB sob o nº {lawyerOab}, com escritório profissional na {lawyerOfficeName}, vem, respeitosamente, à presença de Vossa Excelência, com fulcro no art. 895 da CLT, interpor', { align: 'justified' }),
  blank(100),
  p('RECURSO ORDINÁRIO', { bold: true, size: 26, align: 'center' }),
  blank(100),
  p('contra a r. sentença de fls., proferida pelo MM. Juiz da [VARA] do Trabalho de [CIDADE/UF], nos autos da Reclamação Trabalhista ajuizada por {clientName}, portador(a) do documento nº {clientDocument}, em face de [NOME DA EMPRESA].', { align: 'justified' }),
  blank(200),
  p('I – DA TEMPESTIVIDADE', { bold: true, size: 26, spacing: 300 }),
  p('O presente recurso é tempestivo, uma vez que a publicação da sentença ocorreu em [DATA], e o prazo legal de 8 (oito) dias úteis não se encontra expirado.', { align: 'justified' }),
  blank(200),
  p('II – DO DEPÓSITO RECURSAL', { bold: true, size: 26, spacing: 300 }),
  p('O depósito recursal foi efetuado no valor de [VALOR], conforme guia de recolhimento anexa.', { align: 'justified' }),
  blank(200),
  p('III – DOS PRESSUPOSTOS RECURSAIS', { bold: true, size: 26, spacing: 300 }),
  p('O recurso preenche os pressupostos objetivos e subjetivos de admissibilidade, quais sejam: tempestividade, preparo, legitimação e interesse recursal.', { align: 'justified' }),
  blank(200),
  p('IV – DO MÉRITO', { bold: true, size: 26, spacing: 300 }),
  p('Data venia, a r. sentença merece reforma pelos fundamentos a seguir expendidos:', { align: 'justified' }),
  p('[ARGUMENTAÇÃO DO RECORRENTE]', { align: 'justified' }),
  blank(200),
  p('V – DO CONTRATO DE TRABALHO – DADOS DO CÁLCULO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  blank(120),
  p('VI – DAS VERBAS RECLAMADAS', { bold: true, size: 26, spacing: 300 }),
  kv('Total Bruto:', '{totalValue}'),
  kv('Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  kv('Total Devido Reclamado:', '{totalDevidoReclamado}'),
  kv('Correção Monetária:', '{correctionTotal}'),
  kv('Juros de Mora:', '{interestTotal}'),
  blank(200),
  p('VII – DO PEDIDO', { bold: true, size: 26, spacing: 300 }),
  p('Requer o provimento do presente recurso para reformar a r. sentença, a fim de condenar a reclamada ao pagamento de {totalValue}, acrescido de correção monetária e juros de mora.', { align: 'justified' }),
  blank(400),
  p('Termos em que,', { align: 'justified' }),
  p('Pede provimento.', { align: 'justified' }),
  signature(),
].join('')

const contestacaoContent = [
  p('EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA VARA DO TRABALHO', { bold: true, size: 22, align: 'center', spacing: 300 }),
  blank(200),
  p('[NOME DA EMPRESA], pessoa jurídica de direito privado, inscrita no CNPJ sob o nº [CNPJ], com sede na [ENDEREÇO], por seu advogado infra-assinado, vem, respeitosamente, à presença de Vossa Excelência, nos autos da Reclamação Trabalhista movida por {clientName}, portador(a) do documento nº {clientDocument}, apresentar', { align: 'justified' }),
  blank(100),
  p('CONTESTAÇÃO', { bold: true, size: 26, align: 'center' }),
  blank(200),
  p('I – DA PRELIMINAR', { bold: true, size: 26, spacing: 300 }),
  p('[ARGUMENTAÇÃO DE PRELIMINAR, SE HOUVER]', { align: 'justified' }),
  blank(200),
  p('II – DO MÉRITO – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  p('A reclamada reconhece o vínculo empregatício mantido com o reclamante nos seguintes termos:', { align: 'justified' }),
  blank(100),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  blank(200),
  p('III – DA IMPROCEDÊNCIA DOS PEDIDOS', { bold: true, size: 26, spacing: 300 }),
  p('Contudo, não assiste razão ao reclamante quanto aos pedidos formulados, pelos motivos a seguir:', { align: 'justified' }),
  p('[ARGUMENTAÇÃO DE MÉRITO]', { align: 'justified' }),
  blank(200),
  p('IV – DOS VALORES CONTROVERTIDOS', { bold: true, size: 26, spacing: 300 }),
  kv('Valor reclamado (cálculo do autor):', '{totalValue}'),
  kv('Líquido Devido Reclamante (ref.):', '{liquidoDevidoReclamante}'),
  kv('Total Devido Reclamado (ref.):', '{totalDevidoReclamado}'),
  blank(200),
  p('V – DO PEDIDO', { bold: true, size: 26, spacing: 300 }),
  p('Diante do exposto, requer a total IMPROCEDÊNCIA dos pedidos formulados pelo reclamante, com condenação deste ao pagamento das custas e honorários advocatícios.', { align: 'justified' }),
  blank(200),
  p('VI – DAS PROVAS', { bold: true, size: 26, spacing: 300 }),
  p('Protesta a reclamada pela produção de todas as provas em direito admitidas, em especial a documental, testemunhal e pericial.', { align: 'justified' }),
  blank(400),
  p('Termos em que,', { align: 'justified' }),
  p('Pede total improcedência.', { align: 'justified' }),
  signature(),
].join('')

const rescisaoIndiretaContent = [
  p('EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DA VARA DO TRABALHO', { bold: true, size: 22, align: 'center', spacing: 300 }),
  blank(200),
  p('{lawyerName}, brasileiro, advogado, inscrito na OAB sob o nº {lawyerOab}, com escritório profissional na {lawyerOfficeName}, vem, respeitosamente, à presença de Vossa Excelência, com fulcro no art. 483, §3º, da CLT e art. 840, §1º, da CLT, propor', { align: 'justified' }),
  blank(100),
  p('RECLAMAÇÃO TRABALHISTA – RESCISÃO INDIRETA', { bold: true, size: 26, align: 'center' }),
  blank(200),
  p('I – DO RECLAMANTE', { bold: true, size: 26, spacing: 300 }),
  kv('Nome:', '{clientName}'),
  kv('Documento:', '{clientDocument}'),
  blank(200),
  p('II – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  blank(200),
  p('III – DOS FATOS – DA JUSTA CAUSA EMPREGADORIAL', { bold: true, size: 26, spacing: 300 }),
  p('O reclamante, no curso do contrato de trabalho, foi compelido a requerer a rescisão indireta do contrato de trabalho, nos termos do art. 483, §3º, da CLT, em razão de grave violação contratual pela reclamada, conforme fundamentação a seguir:', { align: 'justified' }),
  p('[DESCREVER AS FALTAS GRAVES DO EMPREGADOR]', { align: 'justified' }),
  blank(200),
  p('IV – DOS EFEITOS DA RESCISÃO INDIRETA', { bold: true, size: 26, spacing: 300 }),
  p('A rescisão indireta equipara-se à dispensa sem justa causa para todos os efeitos legais (Súmula 331, IV, do TST), razão pela qual o reclamante faz jus a todas as verbas rescisórias próprias da modalidade:', { align: 'justified' }),
  blank(100),
  kv('Aviso Prévio:', '{priorNoticeValue}'),
  kv('13º Salário:', '{thirteenthSalaryValue}'),
  kv('Férias + 1/3:', '{vacationValue}'),
  kv('Dobra de Férias:', '{doubleVacationValue}'),
  kv('FGTS (8%):', '{fgtsValue}'),
  kv('Multa FGTS (40%):', '{fgtsFineValue}'),
  kv('Seguro Desemprego:', '{unemploymentInsuranceValue}'),
  kv('Saldo de Salário:', '{saldoSalarioValue}'),
  kv('Horas Extras:', '{extraHoursValue}'),
  kv('Adicional Noturno:', '{nightAdditionalValue}'),
  kv('Insalubridade:', '{insalubrityValue}'),
  kv('Periculosidade:', '{dangerousWorkValue}'),
  kv('Multa Art. 477 CLT:', '{art477FineValue}'),
  blank(200),
  p('V – DA LIQUIDAÇÃO', { bold: true, size: 26, spacing: 300 }),
  kv('Total Bruto:', '{totalValue}'),
  kv('Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  kv('Total Devido Reclamado:', '{totalDevidoReclamado}'),
  blank(200),
  p('Dá-se à causa o valor de {totalValue}.', { align: 'justified' }),
  blank(400),
  p('Termos em que,', { align: 'justified' }),
  p('Pede deferimento.', { align: 'justified' }),
  signature(),
].join('')

const termoQuitacaoContent = [
  header('TERMO DE QUITAÇÃO'),
  p('Pelo presente instrumento, de um lado {clientName}, portador(a) do documento nº {clientDocument}, doravante denominado(a) QUITANTE, e de outro lado [NOME DA EMPRESA], inscrita no CNPJ sob o nº [CNPJ], doravante denominada QUITADA, representada por seu advogado {lawyerName}, OAB {lawyerOab}, firmam o presente TERMO DE QUITAÇÃO, mediante as cláusulas seguintes:', { align: 'justified' }),
  blank(200),
  p('I – DO CONTRATO DE TRABALHO', { bold: true, size: 26, spacing: 300 }),
  kv('Admissão:', '{startDate}'),
  kv('Rescisão:', '{endDate}'),
  kv('Tipo de rescisão:', '{terminationType}'),
  blank(200),
  p('II – DAS VERBAS QUITADAS', { bold: true, size: 26, spacing: 300 }),
  kv('Aviso Prévio:', '{priorNoticeValue}'),
  kv('13º Salário:', '{thirteenthSalaryValue}'),
  kv('Férias + 1/3:', '{vacationValue}'),
  kv('Dobra de Férias:', '{doubleVacationValue}'),
  kv('FGTS (8%):', '{fgtsValue}'),
  kv('Multa FGTS (40%):', '{fgtsFineValue}'),
  kv('Saldo de Salário:', '{saldoSalarioValue}'),
  kv('Horas Extras:', '{extraHoursValue}'),
  kv('Adicional Noturno:', '{nightAdditionalValue}'),
  kv('Insalubridade:', '{insalubrityValue}'),
  kv('Periculosidade:', '{dangerousWorkValue}'),
  kv('Multa Art. 477 CLT:', '{art477FineValue}'),
  blank(200),
  p('III – DA LIQUIDAÇÃO (V3)', { bold: true, size: 26, spacing: 300 }),
  kv('Bruto Devido Reclamante:', '{brutoDevidoReclamante}'),
  kv('(-) INSS Empregado:', '{inssEmployeeValue}'),
  kv('(-) IRPF:', '{irpfValue}'),
  kv('= Líquido Devido Reclamante:', '{liquidoDevidoReclamante}'),
  blank(120),
  kv('TOTAL:', '{totalValue}'),
  blank(200),
  p('IV – DA QUITAÇÃO', { bold: true, size: 26, spacing: 300 }),
  p('O QUITANTE declara ter recebido, nesta data, o valor de {totalValue}, referente a todas as verbas trabalhistas acima discriminadas, dando plena, geral e irrevogável quitação de todos os direitos e obrigações decorrentes do contrato de trabalho mantido entre as partes, inclusive quanto a eventuais reflexos e repercussões, conforme art. 507-B da CLT e Súmula 330 do TST.', { align: 'justified' }),
  blank(200),
  p('V – DO PAGAMENTO', { bold: true, size: 26, spacing: 300 }),
  p('O pagamento foi efetuado mediante depósito bancário na conta indicada pelo QUITANTE, no valor líquido de {liquidoDevidoReclamante}.', { align: 'justified' }),
  blank(200),
  p('VI – DA OBSERVAÇÃO', { bold: true, size: 26, spacing: 300 }),
  p('{observations}'),
  blank(400),
  p('E, por estarem assim de acordo, firmam o presente termo em 02 (duas) vias de igual teor.', { align: 'justified' }),
  blank(400),
  p('{todayLong}.', { align: 'center' }),
  blank(600),
  p('________________________________', { align: 'center' }),
  p('{clientName}', { align: 'center' }),
  p('QUITANTE', { align: 'center' }),
  blank(400),
  p('________________________________', { align: 'center' }),
  p('[NOME DA EMPRESA]', { align: 'center' }),
  p('QUITADA', { align: 'center' }),
  blank(400),
  p('________________________________', { align: 'center' }),
  p('{lawyerName}', { align: 'center' }),
  p('{lawyerOab}', { align: 'center' }),
  p('ADVOGADO', { align: 'center' }),
].join('')

export type SystemTemplateDef = {
  name: string
  description: string
  type: string
  content: string
}

// Metadata + content source for every system template. The `content` is used
// only by this generator to (re)build the .docx; the seed reads the built file.
export const SYSTEM_TEMPLATES: SystemTemplateDef[] = [
  {
    name: 'Parecer Técnico',
    description: 'Parecer técnico-jurídico de apuração trabalhista',
    type: 'parecer_tecnico',
    content: parecerContent,
  },
  {
    name: 'Petição Inicial',
    description: 'Modelo de petição inicial trabalhista',
    type: 'peticao_inicial',
    content: peticaoContent,
  },
  {
    name: 'Proposta de Acordo',
    description: 'Proposta de acordo extrajudicial',
    type: 'proposta_acordo',
    content: acordoContent,
  },
  {
    name: 'Notificação Extrajudicial',
    description: 'Notificação extrajudicial trabalhista',
    type: 'notificacao_extrajudicial',
    content: notificacaoContent,
  },
  {
    name: 'Danos Morais',
    description:
      'Reclamação trabalhista com pedido de indenização por danos morais',
    type: 'danos_morais',
    content: danosMoraisContent,
  },
  {
    name: 'Aviso Prévio Indenizado',
    description: 'Cálculo detalhado de aviso prévio indenizado com reflexos',
    type: 'aviso_previo_indenizado',
    content: avisoPrevioContent,
  },
  {
    name: 'Horas Extras e Adicionais',
    description: 'Reclamação de horas extras e adicionais com reflexos',
    type: 'horas_extras_adicionais',
    content: horasExtrasContent,
  },
  {
    name: 'FGTS e Multa',
    description: 'Cálculo detalhado de FGTS 8% e multa de 40%',
    type: 'fgts_e_multa',
    content: fgtsMultaContent,
  },
  {
    name: 'Recurso Ordinário',
    description: 'Modelo de recurso ordinário trabalhista',
    type: 'recurso_ordinario',
    content: recursoOrdinarioContent,
  },
  {
    name: 'Contestação',
    description: 'Contestação a reclamação trabalhista (para empresa)',
    type: 'contestacao',
    content: contestacaoContent,
  },
  {
    name: 'Rescisão Indireta',
    description:
      'Reclamação trabalhista fundamentada em rescisão indireta (art. 483, §3º, CLT)',
    type: 'rescisao_indireta',
    content: rescisaoIndiretaContent,
  },
  {
    name: 'Termo de Quitação',
    description:
      'Termo de quitação de verbas trabalhistas com recibo de pagamento',
    type: 'termo_quitacao',
    content: termoQuitacaoContent,
  },
]

// Writes every template .docx to prisma/templates/system/ and a manifest.ts
// describing them (name, description, type, file, version=1).
function build() {
  const here = dirname(fileURLToPath(import.meta.url))
  const systemDir = join(here, 'system')

  const manifestEntries = SYSTEM_TEMPLATES.map((t) => {
    const file = `${t.type}.docx`
    writeFileSync(join(systemDir, file), createDocx(t.content))
    console.log(`✓ Wrote ${file}`)
    return {
      name: t.name,
      description: t.description,
      type: t.type,
      file,
      version: 1,
    }
  })

  const manifest = `// AUTO-GENERATED by build-system-templates.ts — do not edit by hand.
// Run \`tsx prisma/templates/build-system-templates.ts\` to regenerate.

export type SystemTemplateManifestEntry = {
  name: string
  description: string
  type: string
  file: string
  version: number
}

export const SYSTEM_TEMPLATE_MANIFEST: SystemTemplateManifestEntry[] = ${JSON.stringify(
    manifestEntries,
    null,
    2,
  )}
`
  writeFileSync(join(here, 'manifest.ts'), manifest)
  console.log(`✓ Wrote manifest.ts (${manifestEntries.length} templates)`)
}

build()
