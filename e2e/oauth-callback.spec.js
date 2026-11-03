import { test,expect } from '@playwright/test';

test('one browser approval reaches a different-origin callback, exchanges the code, and calls scoped MCP',async({page})=>{
  page.on('console',message=>{if(message.type()==='error')console.log('Browser console:',message.text());});
  await page.goto('/fixture/start');
  await page.getByLabel('Administratora parole').fill('browser-fixture-password-123456789');
  await page.getByRole('button',{name:'Pieslēgties',exact:true}).click();
  await page.getByRole('checkbox',{name:'rockmole.lv',exact:true}).check();
  await page.getByRole('button',{name:'Atļaut atlasītos projektus',exact:true}).click();
  await expect(page.getByRole('heading',{name:'OAuth callback and scoped MCP succeeded',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3171\/oauth\/callback\?/);
});
