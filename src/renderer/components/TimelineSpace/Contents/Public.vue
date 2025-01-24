<template>
  <div id="public">
    <DynamicScroller :items="timeline" :min-item-size="86" id="scroller" class="scroller" ref="scroller">
      <template v-slot="{ item, index, active }">
        <DynamicScrollerItem :item="item" :active="active" :size-dependencies="[item.uri]" :data-index="index" :watchData="true">
          <toot
            v-if="account.account && account.server"
            :message="item"
            :focused="item.uri + item.id === focusedId"
            :overlaid="modalOpened"
            :filters="filters"
            :account="account.account"
            :server="account.server"
            v-on:update="updateToot"
            v-on:delete="deleteToot"
            @focusRight="focusSidebar"
            @selectToot="focusToot(item)"
          >
          </toot>
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
    <div :class="openSideBar ? 'upper-with-side-bar' : 'upper'" v-show="!heading">
      <el-button type="primary" @click="upper" circle>
        <font-awesome-icon icon="angle-up" class="upper-icon" />
      </el-button>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onBeforeUpdate, onMounted, onUnmounted, ref, watch, reactive } from 'vue'
import { logicAnd } from '@vueuse/math'
import { useMagicKeys, whenever } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { Entity } from 'megalodon'
import { useI18next } from 'vue3-i18next'
import { useRoute } from 'vue-router'
import { useStore } from '@/store'
import Toot from '@/components/organisms/Toot.vue'
import { EventEmitter } from '@/components/event'
import { MUTATION_TYPES as SIDE_MENU_MUTATION } from '@/store/TimelineSpace/SideMenu'
import { ACTION_TYPES, MUTATION_TYPES } from '@/store/TimelineSpace/Contents/Public'
import { LocalAccount } from '~/src/types/localAccount'
import { LocalServer } from '~/src/types/localServer'
import { MyWindow } from '~/src/types/global'

export default defineComponent({
  name: 'public',
  components: { Toot },
  setup() {
    const space = 'TimelineSpace/Contents/Public'
    const store = useStore()
    const route = useRoute()
    const i18n = useI18next()
    const { j, k } = useMagicKeys()

    const win = (window as any) as MyWindow
    const id = computed(() => parseInt(route.params.id as string))

    const focusedId = ref<string | null>(null)
    const scroller = ref<any>(null)
    const lazyLoading = ref(false)
    const heading = ref(true)
    const account = reactive<{ account: LocalAccount | null; server: LocalServer | null }>({
      account: null,
      server: null
    })

    const timeline = computed(() => store.state.TimelineSpace.Contents.Public.timeline[id.value])
    const openSideBar = computed(() => store.state.TimelineSpace.Contents.SideBar.openSideBar)
    const modalOpened = computed<boolean>(() => store.getters[`TimelineSpace/Modals/modalOpened`])
    const filters = computed(() => store.getters[`${space}/filters`])
    const currentFocusedIndex = computed(() => timeline.value.findIndex(toot => focusedId.value === toot.uri + toot.id))
    const shortcutEnabled = computed(() => !modalOpened.value)

    onMounted(async () => {
      const [a, s]: [LocalAccount, LocalServer] = await win.ipcRenderer.invoke('get-local-account', id.value)
      account.account = a
      account.server = s

      store.commit(`TimelineSpace/SideMenu/${SIDE_MENU_MUTATION.CHANGE_UNREAD_PUBLIC_TIMELINE}`, false)
      document.getElementById('scroller')?.addEventListener('scroll', onScroll)
    })
    onBeforeUpdate(() => {
      if (store.state.TimelineSpace.SideMenu.unreadPublicTimeline && heading.value) {
        store.commit('TimelineSpace/SideMenu/changeUnreadPublicTimeline', false)
      }
    })
    onBeforeUnmount(() => {
      EventEmitter.off('focus-timeline')
    })
    onUnmounted(() => {
      const el = document.getElementById('scroller')
      if (el !== undefined && el !== null) {
        el.removeEventListener('scroll', onScroll)
        el.scrollTop = 0
      }
    })

    watch(focusedId, (newVal, _oldVal) => {
      if (newVal && heading.value) {
        heading.value = false
      } else if (newVal === null && !heading.value) {
        heading.value = true
      }
    })
    whenever(logicAnd(j, shortcutEnabled), () => {
      if (focusedId.value === null) {
        focusedId.value = timeline.value[0].uri + timeline.value[0].id
      } else {
        focusNext()
      }
    })
    whenever(logicAnd(k, shortcutEnabled), () => {
      focusPrev()
    })

    const onScroll = (event: Event) => {
      if (
        (event.target as HTMLElement)!.clientHeight + (event.target as HTMLElement)!.scrollTop >=
          document.getElementById('scroller')!.scrollHeight - 10 &&
        !lazyLoading.value
      ) {
        lazyLoading.value = true
        store
          .dispatch(`${space}/${ACTION_TYPES.LAZY_FETCH_TIMELINE}`, {
            statuses: timeline.value[timeline.value.length - 1],
            account: account.account,
            server: account.server
          })
          .catch(() => {
            ElMessage({
              message: i18n.t('message.timeline_fetch_error'),
              type: 'error'
            })
          })
          .finally(() => {
            lazyLoading.value = false
          })
      }

      if ((event.target as HTMLElement)!.scrollTop > 10 && heading.value) {
        heading.value = false
      } else if ((event.target as HTMLElement)!.scrollTop <= 10 && !heading.value) {
        heading.value = true
      }
    }

    const updateToot = (message: Entity.Status) => {
      if (account.account) {
        store.commit(`${space}/${MUTATION_TYPES.UPDATE_TOOT}`, { status: message, accountId: account.account.id })
      }
    }
    const deleteToot = (message: Entity.Status) => {
      if (account.account) {
        store.commit(`${space}/${MUTATION_TYPES.DELETE_TOOT}`, { statusId: message.id, accountId: account.account.id })
      }
    }
    const upper = () => {
      scroller.value.scrollToItem(0)
      focusedId.value = null
    }
    const focusNext = () => {
      if (currentFocusedIndex.value === -1) {
        focusedId.value = timeline.value[0].uri + timeline.value[0].id
      } else if (currentFocusedIndex.value < timeline.value.length) {
        focusedId.value = timeline.value[currentFocusedIndex.value + 1].uri + timeline.value[currentFocusedIndex.value + 1].id
      }
    }
    const focusPrev = () => {
      if (currentFocusedIndex.value === 0) {
        focusedId.value = null
      } else if (currentFocusedIndex.value > 0) {
        focusedId.value = timeline.value[currentFocusedIndex.value - 1].uri + timeline.value[currentFocusedIndex.value - 1].id
      }
    }
    const focusToot = (message: Entity.Status) => {
      focusedId.value = message.uri + message.id
    }
    const focusSidebar = () => {
      EventEmitter.emit('focus-sidebar')
    }

    return {
      timeline,
      scroller,
      focusedId,
      modalOpened,
      filters,
      updateToot,
      deleteToot,
      focusSidebar,
      focusToot,
      openSideBar,
      heading,
      upper,
      account
    }
  }
})
</script>

<style lang="scss" scoped>
#public {
  height: 100%;
  overflow: auto;
  scroll-behavior: auto;

  .scroller {
    height: 100%;
  }

  .upper {
    position: fixed;
    bottom: 20px;
    right: 20px;
  }

  .upper-with-side-bar {
    position: fixed;
    bottom: 20px;
    right: calc(20px + var(--current-sidebar-width));
    transition: all 0.5s;
  }

  .upper-icon {
    padding: 3px;
  }

  .unread {
    position: fixed;
    right: 24px;
    top: 52px;
    background-color: rgba(0, 0, 0, 0.6);
    color: #ffffff;
    padding: 4px 8px;
    border-radius: 0 0 2px 2px;
    z-index: 1;

    &:empty {
      display: none;
    }
  }
}
</style>

<style lang="scss" src="@/assets/timeline-transition.scss"></style>
