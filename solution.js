'use strict'

const axios = require('axios')
const Nightmare = require('nightmare')
const $ = require('cheerio')
const fs = require('fs')
const BANK_MEGA = 'https://www.bankmega.com/promolainnya.php'
const CLICK = 3000

axios.defaults.timeout = 20000

// MAIN FUNCTION
async function scrape() {
  console.log("Scrapping categories")
  const categories = await fetchCategories()
  console.log("Scrapping promotions in categories")
  const promo = await fetchPromo(categories)
  console.log("Scrapping promotions detail")
  const promoDetail = await fetchPromotionsDetail(promo)
  console.log("Create scrapping results")
  const result = {}
  categories.forEach(category => {
    result[category.title] = []
  })
  promoDetail.forEach(promo => {
    let categoryName = promo.category.title
    delete promo.category
    result[categoryName].push(promo)
  })
  return result
}

// #1 FETCH CATEGORY
async function fetchCategories() {
  return axios({
    method: 'GET',
    url: BANK_MEGA
  })
    .then((response) => {
      if (response && response.data) {
        return $('#subcatpromo img', response.data).map((i, el) => el.attribs).get()
      } else {
        Promise.reject(new Error(`No response from ${ BANK_MEGA }`))
      }
    })
}

// #2 FETCH PROMO
async function fetchPromo(categories) {
  return Promise
    .all(categories.map(fetchPromoCategories))
    .then((promotions) => [].concat.apply([], promotions))
}

// #2A FETCH PROMO IN CATEGORY
async function fetchPromoCategories(category) {
  console.log(`  |- • Scrapping promotions in category ${ category.id }`)
  const nightmare = new Nightmare({ show: false })
  await nightmare
    .goto(BANK_MEGA)
    .exists('#subcatpromo')
    .click('#' + category.id)
    .wait(CLICK)

  const promotions = [];
  let currentPage = 0, lastPage = 0
  do {
    let promosSinglePage = await fetchPromoPage(nightmare, category)
    promotions.push(...promosSinglePage)
    let info = await fetchPage(nightmare)
    if (info) {
      [currentPage, lastPage] = info.split(' ').map((token) => parseInt(token))
        .filter((token) => !isNaN(token))
    } else {
      currentPage = 0
      lastPage = 0
    }
    if (currentPage < lastPage) {
      await nightmare
        .evaluate(() => {
          let nodes = document.querySelectorAll('.page_promo_lain')
          nodes[nodes.length - 1].click()
        }).wait(CLICK)
    }
  } while (currentPage < lastPage)
  console.log(`  |- √ Finished scrapping promotion in category ${ category.id }`)
  return promotions
}

// #2B FETCH PROMO PAGE
async function fetchPromoPage(nightmare, category) {
  return nightmare
    .evaluate(() => document.querySelector('#promolain').innerHTML)
    .then((html) => $('img', html).map((i, el) => {
      let promo = { category: category }
      if (el) {
        if (el.attribs.title)
          promo.title = el.attribs.title
        if (el.parent && el.parent.attribs.href)
          promo.url = new URL(el.parent.attribs.href, BANK_MEGA).toString()
        if (el.attribs.src)
          promo.image_url = new URL(el.attribs.src, BANK_MEGA).toString()
      }
      return promo
    }).get())
}

// #2C FETCH PAGE
async function fetchPage(nightmare) {
  return nightmare
    .evaluate(() => {
      let page = document.querySelector('#paging1')
      if (page) {
        return page.getAttribute('title')
      } else {
        return null
      }
    });
}

// #3 FETCH PROMO DETAIL ALL
async function fetchPromotionsDetail(promotions) {
  return Promise.all(promotions.map(fetchPromoDetail))
}

// #3A FETCH PROMO DETAIL
async function fetchPromoDetail(promo) {
  console.log(`    |- • Scraping details from: ${promo.url}`)
  return axios({
    method: 'GET',
    url: promo.url
  })
    .then((response) => {
      if (response && response.data) {
        promo = Object.assign({}, promo, detailPromo(response))
        console.log(`    |- √ Finished scraping details from ${ promo.url }`)
      } else {
        console.log(`    |- ! Warning: no response/data from ${ promo.url }`)
      }
      return promo;
    }).catch((err) => {
      console.log(`    |- x Error when scraping details from ${ promo.url }  (${err})`)
      promo.error = err.message;
      return promo;
    });
}

// #3B ADDING DETAIL
function detailPromo(response) {
  const detail = {}

  let html = $('#contentpromolain2', response.data).html()
  let area_promo = $('.area', html).text().replace('Area Promo : ', '')
  let periode_promo = $('.periode', html).text().replace(/\t|\n/g, '').replace('Periode Promo : ', '')
  let descImageUrl = $('.keteranganinside img', html).attr('src')

  if (area_promo) detail.area_promo = area_promo
  if (periode_promo) detail.periode_promo = periode_promo
  if (descImageUrl) {
    detail.description_image = new URL(descImageUrl, BANK_MEGA).toString()
  }
  return detail
}

scrape().then((bankmega_promo) => {
  fs.writeFileSync(`solution.json`, JSON.stringify(bankmega_promo, null, 2))
  console.log('Scrapping data successfully')
  process.exit()
}).catch((err) => {
  console.log('An error to scrapping data :', err)
})
