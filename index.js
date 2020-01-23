#!/usr/bin/env node

const k8s = require('@kubernetes/client-node');
const request = require('request');

const kc = new k8s.KubeConfig();
const opts = {};

// kc.loadFromDefault();
kc.loadFromCluster();
kc.applyToRequest(opts);

// argv[0] = node
// argv[1] = index.js

// argv[2] = namespace
const namespace = process.argv[2]
// argv[3] = pipeline-run
const pipelinerunName = process.argv[3]

// argv[4] = commit
const commit = process.argv[4]
// argv[5] = gitlab project id
const projectId = process.argv[5]
// argv[6] = gitlab secret
const gitlabToken = process.argv[6]

const endpoint = `apis/tekton.dev/v1alpha1/namespaces/${namespace}/pipelineruns`
const url = `${kc.getCurrentCluster().server}/${endpoint}/${pipelinerunName}`

const sleep = time => new Promise(resolve => setTimeout(resolve, time))
const poll = (promiseFn, time) => promiseFn().then(
             sleep(time).then(() => poll(promiseFn, time)))

console.log(`watching url: ${url}`)     

var lastStatus;

poll(() => new Promise(() => 
    request.get(url, opts,(_, response, body) => {
        const pipelinerun =  JSON.parse(body)
        const status = pipelinerun.status.conditions[0].reason.toLowerCase()
        console.log(status);
        if (status != lastStatus) {
            sendStatusToGitlab(status)
            lastStatus = status
        }         
    })
), 3000)

function sendStatusToGitlab(status) {
    const gitlabUrl = `https://gitlab.com/api/v4/projects/${projectId}/statuses/${commit}?state=${toGitlabStatus(status)}`
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
