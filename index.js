#!/usr/bin/env node

const k8s = require('@kubernetes/client-node');
const request = require('request');
const version = require('./package.json').version;

const kc = new k8s.KubeConfig();
const opts = {};

// kc.loadFromDefault();
kc.loadFromCluster();
kc.applyToRequest(opts);

const argv = require('yargs')
    .usage('Usage: $0 -p [pipelineRunSelfLink] --statusesUrl [statusesUrl] -t [gitlabToken] [options]')
    .example('tekton-gitlab-statuses \\\n' +
        '-p apis/tekton.dev/v1beta1/namespaces/cicd/pipelineruns/build-blu-api-tekton-update-znrqz \\\n' +
        '--statusesUrl https://gitlab.com/api/v4/projects/8739183/statuses/7aa3f77676859388b04be73c3fa325bf96541be0 \\\n' +
        '-t gitlabtoken')
    .alias('p', 'pipelineRunSelfLink')
    .alias('t', 'token')
    .describe('p', 'The link for the pipeline run resourece, ex:apis/tekton.dev/v1beta1/namespaces/[namespace]/pipelineruns/[resourcename]')
    .describe('statusesUrl', 'https://gitlab.com/api/v4/projects/[projectId]]/statuses/[commit]')
    .describe('t', 'The gitlab token to authenticate the request')
    .describe('targetUrl', 'The target url to see the build, ex:https://tekton.mydomain.com/#/namespaces/cicd/pipelineruns/[pipelinerun]')
    .demandOption(['p','statusesUrl', 'token'])
    .help('h')
    .alias('h', 'help')
    .epilog('copyright 2020')
    .argv;


const pipelineRunSelfLinkName = argv.pipelineRunSelfLink
const statusesUrl = argv.statusesUrl
const targetUrl = argv.targetUrl
const gitlabToken = argv.token

const url = `${kc.getCurrentCluster().server}/${pipelineRunSelfLinkName}`

const sleep = time => new Promise(resolve => setTimeout(resolve, time))
const poll = (promiseFn, time) => promiseFn().then(
             sleep(time).then(() => poll(promiseFn, time)))

console.log(`version: ${version} watching url: ${url}`)     

var lastStatus;

poll(() => new Promise(() => 
    request.get(url, opts,(err, response, body) => {
        const pipelinerun =  JSON.parse(body)

        if (err) {
            console.error('fetch pipeline failed:', err);
        }
        
        const conditions = pipelinerun.status.conditions

        if (typeof conditions === 'undefined') {
            console.error('Failed to find condiftion:', body);
        }

        const status = conditions[0].reason.toLowerCase()
        console.log(status);
        if (status != lastStatus) {
            sendStatusToGitlab(status)
            lastStatus = status
        }         
    })
), 3000)

function sendStatusToGitlab(status) {
    const targetUrlQuery = typeof targetUrl !== 'undefined' ? `&target_url=${targetUrl}` : ''
    const gitlabUrl = `${statusesUrl}?state=${toGitlabStatus(status)}${targetUrlQuery}`
    console.log(`updating gitlab statuses: ${gitlabUrl}`)
    request.post(gitlabUrl, {
        headers: {
            'PRIVATE-TOKEN': gitlabToken
          }
    } ,(err, response, body) => {
        console.log(body)
        if (status != 'running') {
            process.exit()
        }
    })
}

function toGitlabStatus(status) {
    switch (status) {
        case 'succeeded':
            return 'success';
        case 'failed':
            return 'failed'
        case 'cancelled':
            return 'cancelled'            
        case 'running':
            return 'running' 
    }
}
