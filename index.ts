#!/usr/bin/env -S bun run
import { config } from 'dotenv'
import { createLogger, format, transports } from 'winston'

config()

const token = process.env.GITHUB_TOKEN || ''
const username = process.env.USERNAME || ''
const orgs = process.env.ORGS?.split(',') || []
const keywords = process.env.KEYWORDS?.split(',') || []
const check_committer = process.env.CHECK_COMMITTER?.toLowerCase() === 'true'
const max_commits_pages = parseInt(process.env.MAX_COMMITS_PAGES || '10')

const log = createLogger({
  transports: [
    new transports.Console({
      level: 'info',
      format: format.cli(),
    }),
    new transports.File({
      level: 'warn',
      filename: 'results.txt',
      format: format.simple(),
    }),
  ],
})

async function main() {
  let repos = (await get_repos(username)) as any[]
  for (const org of orgs) {
    repos = repos.concat((await get_organization_repositories(org)) as any[])
  }

  await Promise.all(
    repos.map((repo: any) => {
      return (async (repo: any) => {
        const branches: any = await get_branches(repo.full_name)
        for (const branch of branches) {
          log.info(`Checking ${repo.full_name}/tree/${branch.name}`)
          let commits: any[] = []
          for (let p = 0; p < max_commits_pages; p++) {
            const _commits = (await get_commits(
              repo.full_name,
              branch.name,
              p + 1
            )) as any[]
            commits = commits.concat(_commits)
            if (_commits.length < 100) break
          }
          for (const commit of commits) check_email(commit)
        }
      })(repo)
    })
  )
}

function check_email(commit: any) {
  const author = commit.commit.author
  const committer = commit.commit.committer
  for (const keyword of keywords) {
    const author_found = author.email.includes(keyword)
    const committer_found = committer.email.includes(keyword)
    if (author_found || (check_committer && committer_found)) {
      const obj = {
        url: commit.html_url,
        committer: check_committer && committer_found ? committer : undefined,
        author: author_found ? author : undefined,
      }
      log.warn(`Found "${keyword}" in commit: ${JSON.stringify(obj)}`)
      return
    }
  }
}

async function req(
  method: string,
  url: string,
  body?: BodyInit | null | undefined
) {
  return await fetch(url, {
    method: method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body,
  }).then((res) => res.json())
}

async function get_branches(full_name: string) {
  return await req('GET', `https://api.github.com/repos/${full_name}/branches`)
}

async function get_rate_limit() {
  return await req('GET', `https://api.github.com/rate_limit`)
}

async function get_repos(user: string, page = 1) {
  return await req(
    'GET',
    `https://api.github.com/users/${user}/repos?per_page=100&page=${page}`
  )
}

async function get_organization_repositories(org: string, page = 1) {
  return await req(
    'GET',
    `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}`
  )
}

async function get_commits(full_name: string, sha = '', page = 1) {
  return await req(
    'GET',
    `https://api.github.com/repos/${full_name}/commits?per_page=100&page=${page}&sha=${sha}`
  )
}

await main()

export {}
