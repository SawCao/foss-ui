import fs from 'node:fs';
import path from 'node:path';

const COUNT = 20000;
const OUTPUT_DIR = 'src/mock';

// Header for api_flow.csv
const FLOW_HEADER = 'api,inboundDependencyCount,inboundDependents,outboundDependencyCount,outboundDependencies';

// Header for api_scan.csv
const SCAN_HEADER = 'PI name,Platform,Major version,API layer,Market,EIM No,BA ID,Level 2,Level 3,Level 4,Level 5,GitHub repo,Branch,Contract file,Operation file link,SHP app config file,SHP deploy config file,Design document link,Status,Lifecycle status,Data source,Value Stream,Sub Value Stream,CIO,License Name,License Owner,Owner Name,Owner Email,Score,IWPB compliance,Global compliance,Classification,Is BA US scoped,Is Vendor API,Ice Component Id,Ice Component Name,Technology,Language,Build pack/Image,Key,Java version,Impacted,Technology2,Maven Parent,Maven Parent Version,Last updated,branchLastCommitAt,application_id,request_repo_url,request_branch,latest_commit,status_url,plugin_status_url,scan_results_main_status_url,scan_results_plugin_dependencies_status_url,status_policy_action,status_report_html_url,status_report_pdf_url,status_report_data_url,status_embeddable_report_html_url,status_is_error,status_components_affected_critical,status_components_affected_severe,status_components_affected_moderate,status_open_policy_violations_critical,status_open_policy_violations_severe,status_open_policy_violations_moderate,status_grandfathered_policy_violations,status_legacy_violations,status_check_payload,plugin_status_policy_action,plugin_status_report_html_url,plugin_status_report_pdf_url,plugin_status_report_data_url,plugin_status_embeddable_report_html_url,plugin_status_is_error,plugin_status_components_affected_critical,plugin_status_components_affected_severe,plugin_status_components_affected_moderate,plugin_status_open_policy_violations_critical,plugin_status_open_policy_violations_severe,plugin_status_open_policy_violations_moderate,plugin_status_grandfathered_policy_violations,plugin_status_legacy_violations,plugin_status_check_payload,component_count,issue_count,components_with_issues,issue_density_per_component,critical_count';

function generateRandomList(services, count) {
  const selected = [];
  const total = services.length;
  for (let i = 0; i < count; i++) {
    selected.push(services[Math.floor(Math.random() * total)]);
  }
  return `"[${selected.join(', ')}]"`;
}

function generateData() {
  const services = [];
  for (let i = 1; i <= COUNT; i++) {
    services.push(`Service-${i}`);
  }

  // 1. Generate api_flow.csv
  console.log('Generating api_flow.csv...');
  const flowRows = [FLOW_HEADER];
  for (let i = 1; i <= COUNT; i++) {
    const name = services[i - 1];
    const inboundCount = Math.floor(Math.random() * 5);
    const outboundCount = Math.floor(Math.random() * 5);
    
    // To keep it simple, just pick random services. Avoid self-referencing if possible but not critical for mock.
    const inDependents = inboundCount > 0 ? generateRandomList(services, inboundCount) : '[]';
    const outDependencies = outboundCount > 0 ? generateRandomList(services, outboundCount) : '[]';
    
    flowRows.push(`${name},${inboundCount},${inDependents},${outboundCount},${outDependencies}`);
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'test_api_flow_20k.csv'), flowRows.join('\n'));

  // 2. Generate api_scan_20260311.csv
  console.log('Generating api_scan_20260311.csv...');
  const scanRows = [SCAN_HEADER];
  const platforms = ['AWS', 'Azure', 'GCP', 'On-Premise'];
  const layers = ['Core', 'Experience', 'Utility'];
  const statuses = ['Active', 'Deprecated', 'Beta'];
  const tech = ['Java/Spring', 'Node.js', 'Python', 'Go'];
  const classifications = ['Confidential', 'Public', 'Internal', 'Restricted'];

  for (let i = 1; i <= COUNT; i++) {
    const name = services[i - 1];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const layer = layers[Math.floor(Math.random() * layers.length)];
    const techChoice = tech[Math.floor(Math.random() * tech.length)];
    const lang = techChoice.split('/')[0];
    const eim = `EIM-${1000 + i}`;
    const ba = `BA-${100 + i}`;
    const score = Math.floor(Math.random() * 41) + 60; // 60-100
    
    const row = [
      name, platform, 'v1', layer, 'Global', eim, ba, 'Digital', 'Level3', 'Level4', 'Level5',
      `https://github.com/org/${name.toLowerCase()}`, 'main', '', '', '', '', '',
      'Active', 'Production', 'Sonar', '', '', 'Owner Name', 'Apache 2.0', 'Owner', 'Owner', 'owner@example.com',
      score, 'Yes', 'Yes', classifications[Math.floor(Math.random() * classifications.length)], 'No', 'No',
      `ICE-${i}`, `${name} Component`, techChoice, lang, `${lang.toLowerCase()}-docker`, name.toUpperCase(),
      lang === 'Java' ? '17' : 'N/A', 'No', '', '', '1.0', '2026-03-19', '2026-03-19',
      '', '', '', '', '', '', '', '', // urls
      score > 80 ? 'Pass' : 'Fail', `https://sonar.org/${name.toLowerCase()}/main`, '', '', '',
      score < 80 ? 'true' : 'false',
      Math.floor(Math.random() * 2), Math.floor(Math.random() * 2), Math.floor(Math.random() * 5),
      Math.floor(Math.random() * 2), Math.floor(Math.random() * 2), Math.floor(Math.random() * 5),
      0, 0, '',
      'Pass', `https://sonar.org/${name.toLowerCase()}/plugin`, '', '', '', 'false',
      0, 0, 0, 0, 0, 0, 0, 0, '',
      Math.floor(Math.random() * 50), Math.floor(Math.random() * 10), Math.floor(Math.random() * 5),
      (Math.random() * 0.5).toFixed(3), Math.floor(Math.random() * 2)
    ];

    scanRows.push(row.join(','));
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, 'test_api_scan_20k.csv'), scanRows.join('\n'));
  
  console.log('Done! Files generated in src/mock/');
}

generateData();
