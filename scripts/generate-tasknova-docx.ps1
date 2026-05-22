$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$Root = Split-Path -Parent $PSScriptRoot
$ContentPath = Join-Path $Root 'docs\tasknova-spec-content.json'

function Escape-Xml([string]$Text) {
  if ($null -eq $Text) { return '' }
  return [System.Security.SecurityElement]::Escape($Text)
}

function New-RunText([string]$Text) {
  $parts = ($Text -replace "`r`n", "`n") -split "`n", -1
  $runs = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $parts.Count; $i++) {
    if ($i -gt 0) { [void]$runs.Add('<w:r><w:br/></w:r>') }
    if ($parts[$i].Length -gt 0) {
      [void]$runs.Add('<w:r><w:t xml:space="preserve">' + (Escape-Xml $parts[$i]) + '</w:t></w:r>')
    }
  }
  return ($runs -join '')
}

function New-Paragraph([string]$Text, [string]$Style) {
  $styleXml = ''
  if ($Style) {
    $styleXml = '<w:pPr><w:pStyle w:val="' + (Escape-Xml $Style) + '"/></w:pPr>'
  }
  return '<w:p>' + $styleXml + (New-RunText $Text) + '</w:p>'
}

function New-Cell([string]$Text) {
  return @(
    '<w:tc>'
    '<w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>'
    (New-Paragraph $Text '')
    '</w:tc>'
  ) -join ''
}

function New-Table($Rows) {
  $xml = New-Object System.Collections.Generic.List[string]
  [void]$xml.Add('<w:tbl>')
  [void]$xml.Add('<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr>')
  foreach ($row in $Rows) {
    [void]$xml.Add('<w:tr>')
    foreach ($cell in $row) {
      [void]$xml.Add((New-Cell ([string]$cell)))
    }
    [void]$xml.Add('</w:tr>')
  }
  [void]$xml.Add('</w:tbl>')
  return ($xml -join '')
}

function Get-SectionProperties([string]$TemplatePath) {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($TemplatePath)
  try {
    $entry = $archive.GetEntry('word/document.xml')
    $reader = New-Object System.IO.StreamReader($entry.Open())
    $xml = $reader.ReadToEnd()
    $reader.Close()
    $match = [regex]::Match($xml, '<w:sectPr[\s\S]*?</w:sectPr>')
    if ($match.Success) { return $match.Value }
  } finally {
    $archive.Dispose()
  }
  return '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
}

function New-DocumentXml($Blocks, [string]$SectPr) {
  $body = New-Object System.Collections.Generic.List[string]
  foreach ($block in $Blocks) {
    switch ($block.type) {
      'p' { [void]$body.Add((New-Paragraph ([string]$block.text) '')) }
      'h1' { [void]$body.Add((New-Paragraph ([string]$block.text) 'Heading1')) }
      'h2' { [void]$body.Add((New-Paragraph ([string]$block.text) 'Heading2')) }
      'h3' { [void]$body.Add((New-Paragraph ([string]$block.text) 'Heading3')) }
      'h4' { [void]$body.Add((New-Paragraph ([string]$block.text) 'Heading4')) }
      'table' { [void]$body.Add((New-Table $block.rows)) }
      default { throw "Unknown block type: $($block.type)" }
    }
  }

  return @(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">'
    '<w:body>'
    ($body -join '')
    $SectPr
    '</w:body>'
    '</w:document>'
  ) -join ''
}

function Write-Docx($Doc) {
  $template = [string]$Doc.template
  $output = Join-Path $Root ([string]$Doc.output)
  $outputDir = Split-Path -Parent $output
  if (!(Test-Path -LiteralPath $template)) {
    throw "Template not found: $template"
  }
  if (!(Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
  }

  Copy-Item -LiteralPath $template -Destination $output -Force
  $sectPr = Get-SectionProperties $template
  $documentXml = New-DocumentXml $Doc.blocks $sectPr

  $archive = [System.IO.Compression.ZipFile]::Open($output, [System.IO.Compression.ZipArchiveMode]::Update)
  try {
    $entry = $archive.GetEntry('word/document.xml')
    if ($entry) { $entry.Delete() }
    $newEntry = $archive.CreateEntry('word/document.xml')
    $writer = New-Object System.IO.StreamWriter($newEntry.Open(), [System.Text.UTF8Encoding]::new($false))
    $writer.Write($documentXml)
    $writer.Close()
  } finally {
    $archive.Dispose()
  }

  Write-Output $output
}

$content = Get-Content -LiteralPath $ContentPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($doc in $content.documents) {
  Write-Docx $doc
}
